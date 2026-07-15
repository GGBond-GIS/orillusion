import { GUI } from './dat.gui.module.js'

/**
 * @internal
 */
class _GUIHelp {

    public debug: boolean = false;
    public data: any;
    public gui: GUI;
    public bind: { [property: string]: any };

    private _current: GUI;
    private _nullBind: any = {};

    constructor() {
        this.data = {};
        this.bind = {};
        // When debug is off, add() returns this stub. Every dat.gui Controller
        // chain method must round-trip back to the stub so callers can freely
        // chain `.add(...).step(...).listen()` without guarding each step.
        this._nullBind = {};
        const chain = () => this._nullBind;
        for (const m of ['onChange', 'onFinishChange', 'step', 'min', 'max',
                         'listen', 'name', 'options', 'updateDisplay', 'remove']) {
            this._nullBind[m] = chain;
        }
    }

    init(zIndex: number = 10) {
        this.debug = true;
        this.gui = new GUI();
        this.gui.domElement.style.zIndex = `${zIndex}`;
        this.gui.domElement.parentElement.style.zIndex = `${zIndex}`;
        this.addFolder('Orillusion');
    }

    addCustom(label: string, obj, property: string, c?: number, d?: number, e?: number) {
        if (!this.debug)
            return this._nullBind;
        let dgui = this._current ? this._current : this.gui;

        let tobj = {
            [label]: obj[property]
        }
        dgui.add(tobj, label, c, d, e).onChange((v) => {
            obj[property] = v;
        })
    }

    add(a, b?, c?, d?, e?) {
        if (!this.debug)
            return this._nullBind;
        let dgui = this._current ? this._current : this.gui;
        return dgui.add(a, b, c, d, e);
    }

    addLabel(label: string) {
        if (!this.debug)
            return this._nullBind;
        GUIHelp.add({ label: label }, 'label');
    }

    addInfo(label: string, value: any) {
        if (!this.debug)
            return this._nullBind;

        let obj = {};
        obj[label] = value.toString();
        GUIHelp.add(obj, label);
    }

    addColor(target: any, key: string) {
        if (!this.debug)
            return this._nullBind;
        let dgui = this._current ? this._current : this.gui;
        let controller = dgui.addColor(target[key], 'rgba').name(key);

        // dat.gui's ColorController fires onChange with a raw rgba array
        // ([r,g,b,a] in 0-255) — the same format it was initialized with via
        // the `rgba` getter. We maintain two invariants for callers:
        //   1. `target[key]` (the Color instance) stays in sync with the picker
        //   2. user callbacks receive the Color instance, not the raw array
        // dat.gui's `onChange(fn)` is a setter (`__onChange = fn`) — naive
        // chaining would overwrite our writeback. We shadow it per-instance so
        // user's `.onChange(c => ...)` wraps both steps.
        const writeBack = (val: any) => {
            const node = target[key];
            node['rgba'] = val;
            target[key] = node;
            return node;
        };
        controller.onChange(writeBack);
        controller.onChange = (userFn: (c: any) => void) => {
            Object.getPrototypeOf(controller).onChange.call(controller, (val: any) => {
                const node = writeBack(val);
                userFn(node);
            });
            return controller;
        };
        controller.onFinishChange = (userFn: (c: any) => void) => {
            Object.getPrototypeOf(controller).onFinishChange.call(controller, (val: any) => {
                const node = writeBack(val);
                userFn(node);
            });
            return controller;
        };
        return controller;
    }
    addButton(label: string, fun: Function) {
        if (!this.debug)
            return this._nullBind;
        var controls = new (function () {
            this[label] = fun;
        })();
        let dgui = this._current ? this._current : this.gui;
        dgui.add(controls, label);
    }

    open() {
        if (!this.debug)
            return this._nullBind;
        let dgui = this._current ? this._current : this.gui;
        dgui.open();
    }

    close() {
        if (!this.debug)
            return this._nullBind;
        let dgui = this._current ? this._current : this.gui;
        dgui.close();
    }

    public folders: { [key: string]: GUI } = {};
    addFolder(label: string) {
        if (!this.debug)
            return this._nullBind;
        let folder = this.folders[label];
        if (!folder) {
            this._current = this.gui.addFolder(label);
            this.folders[label] = this._current;
        } else {
            this._current = this.folders[label];
        }
        return this._current;
    }

    removeFolder(label: string) {
        if (!this.debug)
            return this._nullBind;
        let folder = this.folders[label];
        if (folder) {
            this.gui.removeFolder(folder);
            this._current = null;
            delete this.folders[label];
        }
    }

    endFolder() {
        if (!this.debug)
            return this._nullBind;
        this._current = null;
    }

    _creatPanel() {
        let gui = new GUI();
        gui.domElement.style.zIndex = `${10}`;
        gui.domElement.parentElement.style.zIndex = `${10}`;
        return gui;
    }

    _add(gui: GUI, a, b?, c?, d?, e?) {
        return gui.add(a, b, c, d, e);
    }

    _addLabel(gui: GUI, label: string) {
        return GUIHelp._add(gui, { label: label }, 'label');
    }

    _addLabelValue(gui: GUI, label: string, value: number) {
        let obj = {};
        obj[label] = value;
        return GUIHelp._add(gui, obj, label);
    }


    _addButton(gui: GUI, label: string, fun: Function) {
        var controls = new (function () {
            this[label] = fun;
        })();
        gui.add(controls, label);
    }

    _addColor(gui: GUI, target: any, label: string) {
        return gui.addColor(target[label], "rgb").name(label);
    }

    _addFolder(gui: GUI, label: string) {
        if (gui['Folder'] == null) {
            gui['Folder'] = {};
        }
        let folder = gui.addFolder(label);
        gui['Folder'][label] = folder;
        return folder;
    }

    _removeFolder(gui: GUI, label: string) {
        if (gui['Folder'] && gui['Folder'][label]) {
            gui.removeFolder(gui['Folder'][label]);
        }
    }
}

/**
 * @internal
 */
export let GUIHelp = new _GUIHelp();
