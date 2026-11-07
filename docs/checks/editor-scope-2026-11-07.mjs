// 开发方案的只读/内存核对，未操作用户草稿或游戏文件。
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEditor, makeCanvas, ROOT } from '../../tools/loader.mjs';
const RA = loadEditor();
const model = RA.EditorModel.create({cols:20,rows:20});
const ed = Object.create(RA.Editor.prototype);
ed.model=model; ed.canvas=makeCanvas(1350,1350);
ed.canvas.clientWidth=1350; ed.canvas.clientHeight=1350;
ed.ctx=ed.canvas.getContext('2d'); ed.W=1350;ed.H=1350;
ed.view={x:0,y:0,zoom:1};
const beforeHash=RA.LevelData.hashSync(model.data);
ed.resize();ed.fitView();ed.zoomAt(100,100,1.2);
const afterView=JSON.parse(ed.exportJSON().value);
const afterViewHash=RA.LevelData.hashSync(model.data);
model.ensure(29,29); // 现有越界扩展接口：坐标29实际使模型扩为30格，不是视图像素参与导出。
const afterGrow=JSON.parse(ed.exportJSON().value);
const items=RA.EditorPalette.build();
const report={date:'2026-11-07',
  viewProbe:{initialModelSize:{cols:20,rows:20},canvasPixels:{width:ed.canvas.width,height:ed.canvas.height},
    exportedSizeAfterView:afterView.size,modelHashUnchangedByView:beforeHash===afterViewHash},
  growProbe:{ensureCell:{col:29,row:29},exportedSize:afterGrow.size},
  palette:{hasOldSpawn:items.some(i=>i.kind==='spawn'),hasOldGoal:items.some(i=>i.ch==='G'),
    brushObjectTypes:items.filter(i=>i.kind==='object').map(i=>i.type),
    registeredButMissingFromBrush:RA.EntityRegistry.types().filter(t=>!items.some(i=>i.type===t))},
  note:'仅验证现有方法和调色板；未重现用户实际页面操作，不能确证其30×30来自哪一次操作。'};
writeFileSync(join(ROOT,'docs/checks/editor-scope-2026-11-07.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
process.exit(report.viewProbe.modelHashUnchangedByView && afterView.size.cols===20 &&
  afterView.size.rows===20 && afterGrow.size.cols===30 && afterGrow.size.rows===30 ? 0 : 1);
