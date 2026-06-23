import { Vector3, VertexAttributeName, GeometryBase } from '@orillusion/core';
import { SoftbodyBase } from './SoftbodyBase';
import { Ammo, Physics } from '../Physics';
import { TempPhyMath } from '../utils/TempPhyMath';
import { Rigidbody } from '../rigidbody/Rigidbody';

export class RopeSoftbody extends SoftbodyBase {
    /**
     * Fix options for the two ends of the rope. Default is `0`.
     *
     * `0`: neither end fixed, `1`: head fixed, `2`: tail fixed, `3`: both ends fixed.
     */
    public fixeds: number = 0;

    /**
     * Indices of fixed nodes. Serves the same purpose as `fixeds`, but allows arbitrary nodes to be pinned individually.
     */
    public fixNodeIndices: number[] = [];

    /**
     * Rope elasticity. Larger values mean less elasticity. Typically in the range 0 to 1. Default is `0.5`.
     */
    public elasticity: number = 0.5;

    /**
     * Rigid body anchored at the head of the rope. When set, the head of the rope is placed at the rigid body's position.
     */
    public anchorRigidbodyHead: Rigidbody;

    /**
     * Rigid body anchored at the tail of the rope. When set, the tail of the rope is placed at the rigid body's position.
     */
    public anchorRigidbodyTail: Rigidbody;

    /**
     * Anchor offset for the head, representing the relative position between the head and its anchored rigid body.
     */
    public anchorOffsetHead: Vector3 = new Vector3();

    /**
     * Anchor offset for the tail, representing the relative position between the tail and its anchored rigid body.
     */
    public anchorOffsetTail: Vector3 = new Vector3();

    private _positionHead: Vector3;
    private _positionTail: Vector3;

    async start(): Promise<void> {
        if (this.anchorRigidbodyHead) {
            const bodyA = await this.anchorRigidbodyHead.wait();
            this._positionHead = TempPhyMath.fromBtVec(bodyA.getWorldTransform().getOrigin());
            Vector3.add(this._positionHead, this.anchorOffsetHead, this._positionHead);
        }
        if (this.anchorRigidbodyTail) {
            const bodyB = await this.anchorRigidbodyTail.wait();
            this._positionTail = TempPhyMath.fromBtVec(bodyB.getWorldTransform().getOrigin());
            Vector3.add(this._positionTail, this.anchorOffsetTail, this._positionTail);
        }
        super.start();
    }

    protected initSoftBody(): Ammo.btSoftBody {
        const vertexArray = this._geometry.getAttribute(VertexAttributeName.position).data;

        this._positionHead ||= new Vector3(vertexArray[0], vertexArray[1], vertexArray[2]);
        this._positionTail ||= new Vector3(vertexArray.at(-3), vertexArray.at(-2), vertexArray.at(-1));

        const ropeStart = TempPhyMath.toBtVec(this._positionHead, TempPhyMath.tmpVecA);
        const ropeEnd = TempPhyMath.toBtVec(this._positionTail, TempPhyMath.tmpVecB);
        const segmentCount = this._geometry.vertexCount - 1;

        const ropeSoftbody = new Ammo.btSoftBodyHelpers().CreateRope(
            Physics.worldInfo,
            ropeStart,
            ropeEnd,
            segmentCount - 1,
            this.fixeds
        );

        return ropeSoftbody;
    }

    protected configureSoftBody(ropeSoftbody: Ammo.btSoftBody): void {

        // Configure soft-body settings and material
        const sbConfig = ropeSoftbody.get_m_cfg();
        sbConfig.set_viterations(10); // Velocity solver iterations
        sbConfig.set_piterations(10); // Position solver iterations

        this.setElasticity(this.elasticity);

        // Fixed nodes
        if (this.fixNodeIndices.length > 0) this.applyFixedNodes(this.fixNodeIndices);

        // Anchor to rigid bodies
        if (this.anchorRigidbodyHead) {
            const body = this.anchorRigidbodyHead.btRigidbody;
            ropeSoftbody.appendAnchor(0, body, this.disableCollision, this.influence);
        }
        if (this.anchorRigidbodyTail) {
            const body = this.anchorRigidbodyTail.btRigidbody;
            ropeSoftbody.appendAnchor(this._geometry.vertexCount - 1, body, this.disableCollision, this.influence);
        }

    }

    /**
     * set rope elasticity to 0~1
     */
    public setElasticity(value: number): void {
        this.elasticity = value;
        this.wait().then(ropeSoftbody => {
            const material = ropeSoftbody.get_m_materials().at(0);
            material.set_m_kLST(value); // Linear stiffness
            material.set_m_kAST(value); // Angular stiffness
        })
    }

    /**
     * Clear anchors. The soft body will detach from the rigid bodies it was attached to.
     * @param isPopBack If true, removes only one anchor. When both head and tail anchors exist, the tail anchor is removed.
     */
    public clearAnchors(isPopBack?: boolean): void {
        if (isPopBack) {
            this._btSoftbody.get_m_anchors().pop_back();
        } else {
            this._btSoftbody.get_m_anchors().clear();
        }
    }

    onUpdate(): void {

        if (!this._btBodyInited) return;

        const nodes = this._btSoftbody.get_m_nodes();
        const vertices = this._geometry.getAttribute(VertexAttributeName.position);

        for (let i = 0; i < nodes.size(); i++) {
            const pos = nodes.at(i).get_m_x();
            vertices.data[3 * i] = pos.x();
            vertices.data[3 * i + 1] = pos.y();
            vertices.data[3 * i + 2] = pos.z();
        }

        this._geometry.vertexBuffer.upload(VertexAttributeName.position, vertices);

    }


    public destroy(force?: boolean): void {
        this.anchorRigidbodyHead = null;
        this.anchorRigidbodyTail = null;
        super.destroy(force);
    }

    /**
     * Build a rope (line) geometry. Note: when attaching a material, the `topology` must be set to `'line-list'`.
     * @param segmentCount Number of segments
     * @param startPos Start position
     * @param endPos End position
     * @returns GeometryBase
     */
    public static buildRopeGeometry(segmentCount: number, startPos: Vector3, endPos: Vector3): GeometryBase {

        let vertices = new Float32Array((segmentCount + 1) * 3);
        let indices = new Uint16Array(segmentCount * 2);

        for (let i = 0; i < segmentCount; i++) {
            indices[i * 2] = i;
            indices[i * 2 + 1] = i + 1;
        }

        // Compute the per-vertex delta
        const deltaX = (endPos.x - startPos.x) / segmentCount;
        const deltaY = (endPos.y - startPos.y) / segmentCount;
        const deltaZ = (endPos.z - startPos.z) / segmentCount;

        for (let i = 0; i <= segmentCount; i++) {
            vertices[i * 3] = startPos.x + deltaX * i;
            vertices[i * 3 + 1] = startPos.y + deltaY * i;
            vertices[i * 3 + 2] = startPos.z + deltaZ * i;
        }

        const ropeGeometry = new GeometryBase();
        ropeGeometry.setIndices(indices);
        ropeGeometry.setAttribute(VertexAttributeName.position, vertices);
        ropeGeometry.addSubGeometry({
            indexStart: 0,
            indexCount: indices.length,
            vertexStart: 0,
            vertexCount: 0,
            firstStart: 0,
            index: 0,
            topology: 0
        });

        return ropeGeometry;
    }

}
