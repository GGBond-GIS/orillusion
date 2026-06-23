import { ComponentBase, GeometryBase, MeshRenderer } from '@orillusion/core';
import { Ammo, Physics } from '../Physics';
import { ActivationState } from '../rigidbody/RigidbodyEnum';
import { Rigidbody } from '../rigidbody/Rigidbody';

export abstract class SoftbodyBase extends ComponentBase {
    private _initResolve!: () => void;
    private _initializationPromise: Promise<void> = new Promise<void>(r => this._initResolve = r);

    protected _btBodyInited: boolean = false;
    protected _btSoftbody: Ammo.btSoftBody;
    protected _geometry: GeometryBase;

    /**
     * Total mass of the soft body. Default value is `1`
     */
    public mass: number = 1;

    /**
     * Collision margin. Default value is `0.15`
     */
    public margin: number = 0.15;

    /**
     * Collision group. Default value is `1`
     */
    public group: number = 1;

    /**
     * Collision mask. Default value is `-1`
     */
    public mask: number = -1;

    /**
     * Anchor influence. The higher the influence, the more closely the soft body node follows the rigid body's motion. Typically this value is between 0 and 1. Default value is `1`.
     */
    public influence: number = 1;

    /**
     * Whether to disable collisions with the anchored rigid body. Default value is `false`.
     */
    public disableCollision: boolean = false;

    /**
     * Set the soft body activation state.
     */
    public set activationState(value: ActivationState) {
        this.wait().then(btSoftbody => btSoftbody.setActivationState(value));
    }

    public get btBodyInited(): boolean {
        return this._btBodyInited;
    }

    public get btSoftBody(): Ammo.btSoftBody {
        return this._btSoftbody;
    }

    init(): void {
        if (!Physics.isSoftBodyWord) {
            throw new Error('Enable soft body simulation by setting Physics.init({useSoftBody: true}) during initialization.');
        }

        this._geometry = this.object3D.getComponent(MeshRenderer)?.geometry;

        if (!this._geometry) {
            throw new Error('SoftBody requires valid geometry.');
        }

    }

    async start(): Promise<void> {
        const btSoftbody = this._btSoftbody = this.initSoftBody();
        this.configureSoftBody(btSoftbody);

        btSoftbody.setTotalMass(this.mass, false);
        Ammo.castObject(btSoftbody, Ammo.btCollisionObject).getCollisionShape().setMargin(this.margin);
        (Physics.world as Ammo.btSoftRigidDynamicsWorld).addSoftBody(btSoftbody, this.group, this.mask);

        // The soft body transform is expressed via vertex updates, so reset the object transform to avoid interference
        // this.transform.localPosition = this.transform.localRotation = Vector3.ZERO;
        // this.transform.localScale = Vector3.ONE;
        this.transform.worldMatrix.identity();

        this._btBodyInited = true;
        this._initResolve();
    }

    protected abstract initSoftBody(): Ammo.btSoftBody;
    protected abstract configureSoftBody(softbody: Ammo.btSoftBody): void;

    /**
     * Asynchronously retrieves the fully initialized soft body instance.
     */
    public async wait(): Promise<Ammo.btSoftBody> {
        await this._initializationPromise;
        return this._btSoftbody;
    }

    /**
     * Wraps the native soft body's `appendAnchor` method to anchor a node to a rigid body.
     * @param nodeIndex - Index of the node to anchor.
     * @param targetRigidbody - The rigid body to anchor to.
     * @param disCollision - Optional. Disable collisions if true.
     * @param influence - Optional. Anchor's influence.
     */
    public appendAnchor(nodeIndex: number, targetRigidbody: Rigidbody, disCollision?: boolean, influence?: number): void {
        disCollision ??= this.disableCollision;
        influence ??= this.influence;
        targetRigidbody.wait().then(btRigidbody => {
            this.wait().then(ropeSoftbody => {
                ropeSoftbody.appendAnchor(nodeIndex, btRigidbody, disCollision, influence);
            })
        })
    }

    /**
     * Fix soft body nodes.
     * @param fixedNodeIndices Indices of the nodes to fix.
     */
    public applyFixedNodes(fixedNodeIndices: number[]): void {
        this.wait().then(btSoftbody => {
            const nodes = btSoftbody.get_m_nodes();
            fixedNodeIndices.forEach(i => {
                if (i >= 0 && i < nodes.size()) {
                    nodes.at(i).get_m_v().setValue(0, 0, 0);
                    nodes.at(i).get_m_f().setValue(0, 0, 0);
                    nodes.at(i).set_m_im(0);
                } else {
                    console.warn(`Index ${i} is out of bounds for nodes array.`);
                }
            });
        })
    }

    /**
     * Clear fixed nodes
     * @param index Index of the node to clear. If not provided, clears all nodes.
     */
    public clearFixedNodes(index?: number): void {
        const nodes = this._btSoftbody.get_m_nodes();
        const size = nodes.size();
        let inverseMass = 1 / this.mass * size;

        if (index != undefined) {
            nodes.at(index).set_m_im(inverseMass);
            return;
        }

        for (let i = 0; i < size; i++) {
            nodes.at(i).set_m_im(inverseMass);
        }
    }


    public destroy(force?: boolean): void {
        if (this._btBodyInited) {
            if (Physics.world instanceof Ammo.btSoftRigidDynamicsWorld) {
                Physics.world.removeSoftBody(this._btSoftbody);
                Ammo.destroy(this._btSoftbody);
            }

            this._geometry = null;
            this._btSoftbody = null;
            this._btBodyInited = false;
        }
        super.destroy(force);
    }

}
