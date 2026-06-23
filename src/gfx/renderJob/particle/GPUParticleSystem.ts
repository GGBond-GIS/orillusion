import { Context3D } from "../../graphics/webGpu/Context3D";
import { StorageGPUBuffer } from "../../graphics/webGpu/core/buffer/StorageGPUBuffer";
import { ComputeShader } from "../../graphics/webGpu/shader/ComputeShader";

/**
 * GPU-driven particle system (skeleton).
 *
 * Per-particle state lives entirely in a storage buffer; a compute
 * pass advances simulation each frame; render goes via
 * `drawIndexedIndirect` so the visible-particle count is also
 * GPU-decided. No CPU readback in the hot path → unlocks 100k+
 * particles at 60fps on desktop WebGPU.
 *
 * **Status — skeleton**: this class provides the buffer + compute
 * pipeline scaffolding and a placeholder simulate shader that
 * advances `position += velocity * dt`. The render path (instanced
 * billboards via indirect draw) is the next step; the existing
 * `packages/particle` CPU particle system continues to work alongside.
 *
 * Buffer layout (32 bytes / particle):
 *   - position (vec3) + life (f32)
 *   - velocity (vec3) + maxLife (f32)
 *
 * @group GFX
 */
export class GPUParticleSystem {
    private readonly _ctx: Context3D;
    private readonly _maxParticles: number;
    private _particleBuffer: StorageGPUBuffer | null = null;
    private _simulateCompute: ComputeShader | null = null;

    constructor(ctx: Context3D, maxParticles: number = 100000) {
        this._ctx = ctx;
        this._maxParticles = maxParticles;
    }

    public get particleBuffer(): StorageGPUBuffer | null { return this._particleBuffer; }
    public get maxParticles(): number { return this._maxParticles; }

    private static readonly STRIDE = 8; // floats per particle (4 + 4)

    public init(): void {
        if (this._particleBuffer) return;
        this._particleBuffer = new StorageGPUBuffer(this._maxParticles * GPUParticleSystem.STRIDE);
        // Initialize all particles dead (life = 0 in slot 3).
        const data = new Float32Array(this._maxParticles * GPUParticleSystem.STRIDE);
        this._particleBuffer.setFloat32Array('data', data);
        this._particleBuffer.apply();

        // Simulate shader is the spawn/update kernel. Production version
        // owns spawn rate, gravity, drag, color-over-life, etc; this
        // skeleton just advances position. See follow-up patch.
        const simulateCode = /*wgsl*/`
            struct Particle {
                pos_life: vec4<f32>,
                vel_maxLife: vec4<f32>,
            };
            struct SimSettings {
                dt: f32,
                _pad0: f32, _pad1: f32, _pad2: f32,
            };
            @group(0) @binding(0) var<uniform> sim: SimSettings;
            @group(0) @binding(1) var<storage, read_write> particles: array<Particle>;

            @compute @workgroup_size(64, 1, 1)
            fn CsMain(@builtin(global_invocation_id) gid: vec3<u32>) {
                let i = gid.x;
                if (i >= arrayLength(&particles)) { return; }
                var p = particles[i];
                if (p.pos_life.w <= 0.0) { return; } // dead
                p.pos_life = vec4<f32>(p.pos_life.xyz + p.vel_maxLife.xyz * sim.dt, p.pos_life.w - sim.dt);
                particles[i] = p;
            }
        `;
        this._simulateCompute = new ComputeShader(simulateCode);
    }
}
