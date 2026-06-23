import { View3D } from "../core/View3D"
import { PassType } from "../gfx/renderJob/passRenderer/state/PassType"

export type ProfilerLabel2 = {
    lable: string,
    start: number,
    end: number,
    total: number,
    count: number,
}


export type ProfilerLabel = {
    lable: string,
    start: number,
    end: number,
    total: number,
    count: number,
    child: Map<string, ProfilerLabel2>
}

export type ProfilerDraw = {
    [key: string]: {
        vertexCount: number,
        indicesCount: number,
        triCount: number,
        instanceCount: number,
        drawCount: number,
        pipelineCount: number,
    }
}

/**
 * Lightweight profiling helper: accumulates per-pass draw statistics for
 * each View3D and tracks named timing labels for performance measurement.
 * @group Util
 */
export class ProfilerUtil {

    private static profilerLabelMap: Map<string, ProfilerLabel> = new Map<string, ProfilerLabel>();

    /** Per-view draw-statistic records keyed by the owning View3D. */
    public static viewMap: Map<View3D, ProfilerDraw> = new Map<View3D, ProfilerDraw>();

    /** Scratch counters available for ad-hoc debugging. */
    public static testObj = {
        testValue1: 0,
        testValue2: 0,
        testValue3: 0,
        testValue4: 0,
    }

    /** Ensure a draw-stat record exists for the view and reset all pass counters to zero. */
    public static startView(view: View3D) {
        let countInfo = this.viewMap.get(view);
        if (!countInfo) {
            countInfo = {}
            for (const key in PassType) {
                let i = parseInt(key);
                if (i >= 0) {
                } else {
                    countInfo[key] = {
                        vertexCount: 0,
                        indicesCount: 0,
                        instanceCount: 0,
                        triCount: 0,
                        drawCount: 0,
                        pipelineCount: 0
                    }
                }
            }
            this.viewMap.set(view, countInfo)
        }

        for (const key in PassType) {
            let i = parseInt(key);
            if (i >= 0) {
            } else {
                countInfo[key].vertexCount = 0;
                countInfo[key].indicesCount = 0;
                countInfo[key].triCount = 0;
                countInfo[key].instanceCount = 0;
                countInfo[key].drawCount = 0;
                countInfo[key].pipelineCount = 0;
            }
        }
    }

    /** Reset and return the draw-stat record for the view. */
    public static viewCount(view: View3D): ProfilerDraw {
        this.startView(view);
        return this.viewMap.get(view);
    }

    /** Accumulate vertex count for a pass of the view. */
    public static viewCount_vertex(view: View3D, pass: string, v: number) {
        this.viewMap.get(view)[pass].vertexCount += v;
    }

    /** Accumulate index count for a pass of the view. */
    public static viewCount_indices(view: View3D, pass: string, v: number) {
        this.viewMap.get(view)[pass].indicesCount += v;
    }

    /** Accumulate triangle count for a pass of the view. */
    public static viewCount_tri(view: View3D, pass: string, v: number) {
        this.viewMap.get(view)[pass].triCount += v;
    }

    /** Accumulate instance count for a pass of the view. */
    public static viewCount_instance(view: View3D, pass: string, v: number) {
        this.viewMap.get(view)[pass].instanceCount += v;
    }

    /** Increment the draw-call count for a pass of the view. */
    public static viewCount_draw(view: View3D, pass: string) {
        this.viewMap.get(view)[pass].drawCount++;
    }

    /** Increment the pipeline-switch count for a pass of the view. */
    public static viewCount_pipeline(view: View3D, pass: string) {
        this.viewMap.get(view)[pass].pipelineCount++;
    }

    /** Drop the view's draw-stat record. */
    // Engine3D.dispose() calls this so profiler counters don't leak the
    // View3D (and its draw-stat record) for every disposed engine.
    public static removeView(view: View3D) {
        this.viewMap.delete(view);
    }

    /** Begin (or restart) timing the named label. */
    public static start(id: string) {
        let profilerLabel = this.profilerLabelMap.get(id);
        if (!profilerLabel) {
            profilerLabel = {
                lable: id,
                start: 0,
                end: 0,
                total: 0,
                count: 0,
                child: new Map<string, ProfilerLabel2>()
            }
            this.profilerLabelMap.set(id, profilerLabel);
        }
        profilerLabel.start = performance.now();
        profilerLabel.end = performance.now();
        profilerLabel.count = 0;
        profilerLabel.child.clear();
    }

    /** Stop timing the named label and record its total elapsed time. */
    public static end(id: string) {
        let profilerLabel = this.profilerLabelMap.get(id);
        if (profilerLabel) {
            profilerLabel.end = performance.now();
            profilerLabel.total = profilerLabel.end - profilerLabel.start;
        }
    }

    /** Increment a label's call count and optionally begin timing a child label. */
    public static countStart(id: string, id2: string = "") {
        let profilerLabel = this.profilerLabelMap.get(id);
        if (profilerLabel) {
            profilerLabel.count++;
            if (id2 != "") {
                let node = profilerLabel.child.get(id2);
                if (!node) {
                    node = {
                        lable: id2,
                        start: 0,
                        end: 0,
                        total: 0,
                        count: 0,
                    }
                }
                node.start = performance.now();
                node.end = performance.now();
                node.count = 0;
                profilerLabel.child.set(id2, node);
            }
        }
    }

    /** Stop timing a child label and record its elapsed time and count. */
    public static countEnd(id: string, id2: string) {
        let profilerLabel = this.profilerLabelMap.get(id);
        if (profilerLabel) {
            if (id2 != "") {
                let node = profilerLabel.child.get(id2);
                if (!node) {
                    node = {
                        lable: id2,
                        start: 0,
                        end: 0,
                        total: 0,
                        count: 0,
                    }
                }
                node.end = performance.now();
                node.total = node.end - node.start;
                node.count++;
            }
        }
    }

    /** Log the named label's total elapsed time to the console. */
    public static print(id: string) {
        let profilerLabel = this.profilerLabelMap.get(id);
        if (profilerLabel) {
            console.log("performance", id, profilerLabel.total + " ms");
        }
    }
}
