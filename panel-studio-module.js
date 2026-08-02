// Panel Studio — native module (no iframe, no postMessage).
// Ported from panel-studio_1_1_5_26.html (archived) as part of the
// unified-participant-workspace migration. Internal logic is unchanged;
// only the outer boundary changed: it's called directly via
// PanelStudio.mount/applyTaskFile/buildStateSnapshot/restoreState/onComplete
// instead of talking to a separate document over postMessage.
window.PanelStudio = (function(){

function getMarkup(){
  return `
<div id="screen-select">
  <div class="sel-header">
    <span class="ps-badge">Panel Studio · Flat ↔ Form</span>
    <h1>Choose Your Garment</h1>
    <p>Select the garment you will be working with, then click Start Workshop.</p>
  </div>
  <div class="import-row">
    <input type="file" id="task-file-input" accept="application/json,.json" style="display:none" onchange="handleTaskFileInput(this)">
    <button class="import-btn" onclick="document.getElementById('task-file-input').click()"><i data-lucide="download"></i> Import task file from Workshop Console</button>
    <div class="import-note">Loads the garment and panel list your researcher assigned. Or pick a garment below.</div>
  </div>

  <div class="garment-grid" id="garment-grid"></div>

  <button class="start-btn" id="start-btn" onclick="startWorkshop()">Start Workshop →</button>
</div>

<!-- ═══ SCREEN 1: WORKSHOP ═══ -->
<div id="screen-workshop">

  <div class="studio-header">
    <div class="studio-title">Panel Studio</div>
    <span class="studio-stage-badge" id="ps-stage-badge"></span>
    <div class="studio-progressbar"><i id="ps-progress-fill"></i></div>
    <div class="studio-timer" id="ps-timer">--:--</div>
    <button class="btn blue" id="ps-finish-btn" onclick="showCompleteModal()">Finish ✓</button>
    <button class="btn ghost" id="ps-back-btn" onclick="_goBack()" style="display:none">← Back to Activity</button>
  </div>

  <div class="ws-body">

    <!-- LEFT: task brief panel (garment brief text + image tab-switcher) -->
    <div class="left-panel">
      <div id="plan-panel-content"></div>
    </div>

    <!-- RIGHT PANEL -->
    <div class="right-panel">
      <div class="ps-tray-row">
        <div class="ps-tray-label">Panel tray</div>
        <div class="tray-inline-strip"><div class="tray-grid" id="panel-tray"></div></div>
        <button class="btn ghost sm" onclick="moveAllTrayPanelsToWorkspace()">Move all ↓</button>
      </div>
      <div class="workspace-wrap">
        <div class="workspace-card">

          <div class="ws-flex">
            <!-- LEFT icon toolbar: drawing / shape-editing tools -->
            <div class="icon-toolbar left">
              <button id="btn-select" class="icon-btn on" onclick="toggleSelectMoveMode()"><i data-lucide="mouse-pointer-2"></i><span class="icon-label">Select &amp; Move tool</span></button>
              <div class="icon-sep"></div>
              <button id="btn-draw" class="icon-btn" onclick="togglePenMode()"><i data-lucide="pen-tool"></i><span class="icon-label">Vector-Pen tool</span></button>
              <button id="btn-freehand" class="icon-btn" onclick="toggleFreehandMode()"><i data-lucide="pencil"></i><span class="icon-label">Freehand pencil tool</span></button>
              <div class="icon-sep"></div>
              <button class="icon-btn" onclick="fillSelectedPanels()"><i data-lucide="paint-bucket"></i><span class="icon-label">Fill tool</span></button>
              <button id="btn-merge" class="icon-btn" onclick="mergeSelectedPanels()" disabled><i data-lucide="combine"></i><span class="icon-label">Combine tool (2+ selected)</span></button>
              <button id="btn-trace" class="icon-btn" onclick="traceSelectedPanels()" disabled><i data-lucide="spline"></i><span class="icon-label">Trace outer contour</span></button>
              <div class="icon-sep"></div>
              <button id="btn-template" class="icon-btn tpl-icon-btn" onclick="toggleTemplateOverlay()" title="Template"><img src="" id="btn-template-thumb" alt=""><span class="icon-label">Arrangement template</span></button>
              <button id="btn-grid" class="icon-btn" onclick="toggleGridOverlay()"><i data-lucide="grid-3x3"></i><span class="icon-label">Grid — precision drawing/scaling</span></button>
              <button id="btn-margin" class="icon-btn" onclick="toggleMarginGuide()"><i data-lucide="ruler"></i><span class="icon-label">Margin guide</span></button>
            </div>

            <!-- 3×3 ruler + viewport grid -->
            <div id="ws-layout">
              <div id="ruler-tl"></div>
              <div id="ruler-h"><div id="ruler-h-inner"></div></div>
              <div id="ruler-tr"></div>

              <div id="ruler-v"><div id="ruler-v-inner"></div></div>
              <div id="ws-viewport">
                <div id="workspace">
                  <!-- Square grid overlay: toggleable, for precision drawing/scaling -->
                  <div id="grid-overlay"></div>
                  <div id="margin-guide"></div>
                  <!-- Template underlay: faint reference sheet, toggled on/off -->
                  <img id="template-overlay" src="" alt="" draggable="false">
                  <!-- Trace overlay: panel image shown as semi-transparent guide -->
                  <div id="trace-overlay">
                    <img id="trace-overlay-img" src="" alt="" draggable="false">
                    <div id="trace-overlay-bar">
                      <button class="trace-bar-btn" onclick="closeTraceOverlay()">✕ Close</button>
                    </div>
                  </div>
                  <div id="garment-overlay">
                    <img id="garment-overlay-img" src="" alt="" draggable="false">
                  </div>
                  <div id="scaffold-overlay">
                    <img id="scaffold-overlay-img" src="" alt="" draggable="false">
                  </div>
                  <div id="map-banner">
                    <div class="map-step" id="map-step-1">① Click a panel</div>
                    <div class="map-step pending" id="map-step-2">② Click garment location</div>
                  </div>
                  <svg id="pen-svg" xmlns="http://www.w3.org/2000/svg">
                    <!-- Filled completed path -->
                    <path id="pen-path"    fill="rgba(190,140,60,.15)" stroke="#a06820" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" d="" style="display:none"/>
                    <!-- Dashed preview from last node to cursor -->
                    <path id="pen-preview" fill="none" stroke="#a06820" stroke-width="1.5" stroke-dasharray="5,3" stroke-linecap="round" d="" style="display:none"/>
                    <!-- Handle lines (lines from anchor to control point) -->
                    <g id="pen-handle-lines"></g>
                    <!-- Handle control-point circles -->
                    <g id="pen-handle-circles"></g>
                  <!-- Anchor node squares -->
                  <g id="pen-node-rects"></g>
                  <!-- Cursor indicator -->
                  <circle id="pen-cursor" r="5" fill="none" stroke="#a06820" stroke-width="1.5" cx="-999" cy="-999"/>
                </svg>
                <div id="mannequin-win">
                  <div id="mq-bar">
                    <span id="mq-bar-title">⊕ 3D Dress Form</span>
                    <button class="mq-rot-btn" onclick="rotateMQ(-0.35)" title="Rotate left">◀</button>
                    <button class="mq-rot-btn" onclick="rotateMQ(0.35)"  title="Rotate right">▶</button>
                    <button class="mq-rot-btn" id="mq-spin-btn" onclick="toggleAutoSpin()" title="Auto-spin">⟳</button>
                    <span id="mq-close" onclick="closeMannequin()">✕</span>
                  </div>
                  <canvas id="mq-canvas" width="270" height="360"></canvas>
                  <div id="mq-foot">Drag panels over the form · ◀ ▶ to rotate · ⟳ to auto-spin</div>
                </div>
                <div class="selection-rect" id="sel-rect"></div>
                <div class="ws-empty" id="ws-empty">
                  <span class="em-icon">🧩</span>
                  <span>Open the Panel Tray (top right) and click a panel to place it here</span>
                </div>
              </div>
              </div>
              <div id="ruler-r"><div id="ruler-r-inner"></div></div>

              <div id="ruler-bl"></div>
              <div id="ruler-b"><div id="ruler-b-inner"></div></div>
              <div id="ruler-br"></div>
            </div>

            <!-- RIGHT labeled toolbar: transform + undo/redo + delete + export + print -->
            <div class="icon-toolbar right ps-toolbar-labeled">
              <button class="ws-btn" onclick="rotateSelectedPanels(90)" title="Rotate 90°">↻<span>rot</span></button>
              <button class="ws-btn" onclick="duplicateSelectedPanels()" title="Duplicate">⧉<span>dup</span></button>
              <button class="ws-btn" onclick="flipSelectedPanels()" title="Mirror">⇋<span>flip</span></button>
              <button class="ws-btn" onclick="performUndo()" title="Undo">↺<span>undo</span></button>
              <button class="ws-btn" id="btn-redo" onclick="performRedo()" title="Redo" style="display:none;">↻<span>redo</span></button>
              <button class="ws-btn" onclick="deleteSelectedPanels()" title="Delete only the selected panel(s)">✕<span>del</span></button>
              <div class="icon-sep"></div>
              <button class="ws-btn ws-btn-export danger-label" onclick="exportWorkspace('pdf')" title="Export as PDF">PDF</button>
              <button class="ws-btn ws-btn-export danger-label" onclick="exportWorkspace('png')" title="Export as PNG">PNG</button>
              <div class="icon-sep"></div>
              <button class="ws-btn ws-btn-export" onclick="printWorkspace()" title="Print (A4 portrait)"><i data-lucide="printer"></i></button>
              <button class="ws-btn danger" onclick="clearWorkspace()" title="Clear Workspace — removes every panel, not just the selected one"><i data-lucide="eraser"></i></button>
            </div>
          </div>

        </div>
      </div>
      <div class="ps-canvas-hint">drag to move · select a panel, then use the tools · scroll the tray for all panels</div>
    </div><!-- /right -->

  </div><!-- /ws-body -->
</div><!-- /screen-workshop -->

<!-- Print layer: populated by printWorkspace() and shown only during @media print -->
<div id="print-layer"></div>

<!-- Instructions / Complete-task modal -->
<div id="task-modal-backdrop" style="display:none;position:fixed;inset:0;background:rgba(20,20,20,.55);z-index:10000;align-items:center;justify-content:center;">
  <div id="task-modal-box" style="background:#fff;border-radius:14px;max-width:520px;width:92%;max-height:80vh;overflow:auto;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.35);"></div>
</div>
  `;
}

// ════════════════════════════════════════
//  INSTRUCTIONS & COMPLETE-TASK MODAL
// ════════════════════════════════════════
function _taskStageName(){
  const map={pretest:'Pre-test',s1:'Stage 1',s2:'Stage 2',s3:'Stage 3',posttest:'Post-test'};
  return currentTaskMeta ? (map[currentTaskMeta.stage]||currentTaskMeta.stage||'this task') : 'this task';
}
function _closeTaskModal(){ document.getElementById('task-modal-backdrop').style.display='none'; }
function getStageSteps(stage){
  if (stage==='pretest' || stage==='posttest') {
    return [
      'Look at the garment reference images (full garment, front &amp; back, flat sketch) shown on the task page.',
      'You\'ve been given a set of <b>basic panels</b> in the Panel Tray — these are not the garment\'s actual panels. Use them as a starting point.',
      'Design and shape the panels needed to construct the garment shown, using the Pen tool to draw or modify shapes as needed.',
      'Arrange your finished panels on the A4 workspace in a layout that would make sense for construction — use the <b>Template</b> toggle for guidance on where each panel type usually goes, and turn it off once you don\'t need it.',
      'When you\'re happy with your arrangement, click <b>✓ Complete</b>.',
    ];
  } else if (stage==='s1') {
    return [
      'Review the garment image you\'ve been assigned.',
      'Identify all the individual panels needed to construct it from the Panel Tray, including duplicates (e.g. two sleeves).',
      'Arrange the panels into a construction-ready layout — use the Template toggle for guidance.',
      'When finished, click <b>✓ Complete</b>.',
    ];
  } else if (stage==='s2') {
    return [
      'You\'ve been given the solution panel arrangement and a garment image as scaffolding.',
      'Print your panel arrangement, or use it as reference in Clo3D.',
      'Construct the garment physically (paper/fabric) or digitally (Clo3D).',
      'When finished, use the upload option in the Workshop Console participant page to add your screenshots / Clo3D project file / photos.',
      'Click <b>✓ Complete</b> once you\'ve arranged everything here in Panel Studio.',
    ];
  } else if (stage==='s3') {
    return [
      'Review the garment image with the marked style-line area.',
      'Work with the group arrangement panel set in the workspace.',
      'Mark the corresponding area on the relevant panels, and consolidate it into a single shape representing the marked area in 2D.',
      'When finished, click <b>✓ Complete</b>, then upload the resulting shape in the Workshop Console participant page.',
    ];
  }
  return ['Arrange your panels on the workspace as instructed by your researcher.', 'When finished, click <b>✓ Complete</b>.'];
}
function showCompleteModal(){
  if (!wsPanels.length) { alert('Your workspace is empty — arrange your panels before completing the task.'); return; }
  document.getElementById('task-modal-box').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <h2 style="margin:0;font-size:20px">Complete ${_taskStageName()}?</h2>
      <button onclick="_closeTaskModal()" style="border:none;background:none;font-size:20px;cursor:pointer;line-height:1;color:#888">✕</button>
    </div>
    <p style="color:#444;line-height:1.6;margin-top:14px">Before you finish, make sure your arrangement is exactly how you want it — you can still go back and adjust after closing this.</p>
    <ul style="color:#444;line-height:1.7;padding-left:20px">
      <li>Export your work (PNG / SVG / PDF) if your researcher asked for a file, or</li>
      <li>Use <b>Save</b> to keep an editable copy of this project</li>
    </ul>
    <div style="display:flex;gap:10px;margin-top:20px">
      <button onclick="_closeTaskModal()" style="padding:10px 18px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer">Keep working</button>
      <button onclick="_confirmComplete()" style="padding:10px 18px;border-radius:8px;border:1px solid #1a7f37;background:#1a7f37;color:#fff;cursor:pointer;font-weight:600">✓ Yes, mark complete</button>
    </div>
  `;
  document.getElementById('task-modal-backdrop').style.display='flex';
}
function _confirmComplete(){
  // Confirming Finish stops the session clock immediately (the countdown/
  // progress bar in the studio header freeze at their current value) and
  // hands the result over via a direct callback instead of postMessage to a
  // parent/opener window — then closes the modal right away. The host
  // (participant workspace) does the actual "leave Studio, open Survey"
  // navigation from inside that callback; there is no intermediate
  // confirmation screen shown here.
  if (sessionRunning) { sessionElapsed = getSessionElapsed(); sessionRunning = false; }
  _fireComplete(buildStateSnapshot(), currentTaskMeta ? currentTaskMeta.stage : null);
  _closeTaskModal();
}

// ════════════════════════════════════════
//  CONSTANTS & STATE
// ════════════════════════════════════════
const TOTAL  = 14;
const WS_W   = 794;   // A4 width  at 96dpi (portrait) = 210mm
const WS_H   = 1123;  // A4 height at 96dpi (portrait) = 297mm
// Pixel → mm ratio (1px = 210/794 mm ≈ 0.2645mm, same 96dpi conversion either orientation)
const PX_TO_MM = 210 / 794;

let selectedGarment = null;
let wsPanels        = [];
let currentTaskMeta = null; // metadata of the imported task (stage, garment, complexity, style line, etc.)
// (cross-tab handoff removed — see public API at the bottom of this module)
function buildStateSnapshot(){
  return {
    flatform_panel_studio_project: true, version: 1,
    savedAt: new Date().toISOString(),
    selectedGarment: (typeof selectedGarment !== 'undefined') ? selectedGarment : null,
    wsPanels: wsPanels,
  };
}
// (postMessage listener removed — native integration calls applyTaskFile/
// buildStateSnapshot/restoreState directly; see the public API at the
// bottom of this module.)
// ── Undo / redo history ──
let undoStack        = [];
let redoStack         = [];
const UNDO_MAX_STATES = 50;
function updateUndoRedoButtons(){
  const r = document.getElementById('btn-redo');
  if (r) r.style.display = redoStack.length ? '' : 'none';
}
function snapshotForUndo(){
  try {
    undoStack.push(JSON.parse(JSON.stringify(wsPanels)));
    if (undoStack.length > UNDO_MAX_STATES) undoStack.shift();
    redoStack.length = 0; // a fresh action invalidates any previous redo history
    updateUndoRedoButtons();
  } catch(e){ /* ignore snapshot failures — never block the action itself */ }
}
function rerenderAllPanelsFromState(){
  document.querySelectorAll('.ws-panel-el').forEach(el => el.remove());
  wsPanels.forEach(p => { if (p.penData && p.penData.isMerged) renderMergedPanel(p); else renderPanel(p); });
  selectedIds.clear();
  updateEmptyState();
}
function performUndo(){
  if (!undoStack.length) return;
  if (penMode) { clearPenState(); }
  try { redoStack.push(JSON.parse(JSON.stringify(wsPanels))); } catch(e){}
  wsPanels = undoStack.pop();
  rerenderAllPanelsFromState();
  updateUndoRedoButtons();
}
function performRedo(){
  if (!redoStack.length) return;
  if (penMode) { clearPenState(); }
  try { undoStack.push(JSON.parse(JSON.stringify(wsPanels))); } catch(e){}
  wsPanels = redoStack.pop();
  rerenderAllPanelsFromState();
  updateUndoRedoButtons();
}

// ════════════════════════════════════════
//  SAVE / OPEN PROJECT — full round-trip state, for crash recovery
//  (PDF/PNG/SVG exports are one-way visual outputs and can't be re-opened
//  for editing; this is a separate, structured save format for that purpose)
// ════════════════════════════════════════
let currentProjectFileHandle = null; // FileSystemFileHandle, when the browser supports true in-place saving
let currentProjectFileName = null;   // remembered filename, used to keep a consistent name either way

let selectedIds     = new Set();
let zCounter        = 10;

let drag       = { active:false };
let resizeDrag = { active:false, id:null, mode:'scale', sx:0, sy:0, initScale:1, initRot:0, initAngle:0, ws_cx:0, ws_cy:0 };
let rubberBand = { active:false };

let guides        = [];
let guideDrag     = { active:false, id:null, type:null };
let guidesVisible = true;

const taskIds = ['t1','t2','t3','t4'];
const timers  = {};
taskIds.forEach(id => timers[id] = { elapsed:0, startedAt:null, running:false });
let workshopStarted   = false;
let sessionStart      = null;
let sessionRunning    = false;
let sessionElapsed    = 0;   // ms accumulated before last pause

// ── Read-only review mode (Participant asks for this once a stage's
// studio work is already marked complete — see setReadOnly() below) ──
let psReadOnly        = false;
let psCompletedLabel  = '';

let garmentOverlayOn  = false;
let traceOverlaySrc   = null; // src of panel currently shown as trace guide

// ── SELECT & MOVE TOOL — the baseline interaction mode. Exactly one of
// selectMoveMode / penMode / freehandMode is true at a time (see
// toggleSelectMoveMode/togglePenMode/toggleFreehandMode, which each turn the
// others off). Panel click/drag was already only reachable in this state
// (drawing tools add the 'pen-mode-panels-off' class that disables pointer
// events on every panel) — this flag makes that state explicit and
// selectable again, rather than just "whatever's left when no drawing tool
// is on", so participants have a clear, learnable "this is my safe default"
// button instead of guessing why clicking a panel isn't doing anything. ──
let selectMoveMode  = true;

// ── PEN TOOL STATE ──
let penMode         = false;
let penNodes        = [];    // [{x, y, handleIn:{x,y}|null, handleOut:{x,y}|null, smooth:bool}]
let penDragging     = false; // dragging handle of most-recently placed node
let penDragOrigin   = null;  // {x,y} workspace coords of the mousedown
let penHoverClose   = false; // cursor is near first node → will close on click
let penMousePos     = { x:0, y:0 };
let penFinishing    = false; // guard against dblclick adding an extra node
let penPendingClose = false; // mousedown on close node, dragging sets close handle
let penEditMode     = false; // editing an existing pen path
let penEditPanelId  = null;  // id of panel being edited
let penEditClosed   = false; // was the path closed?
let penEditDragNode = -1;    // index of anchor node being dragged (-1 = none)
let penEditNodeStart = null; // {x,y} at mousedown on a node — used to detect click (no drag) vs real drag
let penEditDragHandle = null;// {idx, type:'in'|'out'} handle being dragged

const PEN_CLOSE_R    = 14;   // px — snap-to-close radius
const PEN_DRAG_THRESH = 4;   // px — minimum drag to activate handles
const PEN_NODE_HIT_R  = 8;   // px — hit radius for node click
const PEN_HANDLE_HIT_R = 7;  // px — hit radius for handle click

let mapMode       = false;
let panelMappings = {};
let garmentPinEls = {};
let mapCounter    = 1;
let pendingMapNum = null;

let mqInited   = false;
let mqScene, mqCamera, mqRenderer, mqMesh;
let mqAutoSpin = false;
let mqRotDrag  = { active:false, sx:0 };
let mqWinDrag  = { active:false, sx:0, sy:0, ix:0, iy:0 };


// ════════════════════════════════════════
//  EMBEDDED WORKSHOP DATA
// ════════════════════════════════════════
const WORKSHOP_DATA = {
  garments: [
  ],
  panels: {
    "Tunic": [
    {src:"data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMiIgZGF0YS1uYW1lPSJMYXllciAyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMTkuNDcgMTIxLjA2Ij4KICA8ZGVmcz4KICAgIDxzdHlsZT4KICAgICAgLmNscy0xIHsKICAgICAgICBmaWxsOiBub25lOwogICAgICAgIHN0cm9rZTogIzIzMWYyMDsKICAgICAgICBzdHJva2UtbWl0ZXJsaW1pdDogMTA7CiAgICAgIH0KICAgIDwvc3R5bGU+CiAgPC9kZWZzPgogIDxnIGlkPSJMYXllcl8xLTIiIGRhdGEtbmFtZT0iTGF5ZXIgMSI+CiAgICA8cG9seWdvbiBjbGFzcz0iY2xzLTEiIHBvaW50cz0iMTE4Ljk3IC41IDExOC45NyAxMjAuNTYgLjUxIDEyMC41NiAyLjEgLjUgMTE4Ljk3IC41Ii8+CiAgPC9nPgo8L3N2Zz4="},
    {src:"data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMiIgZGF0YS1uYW1lPSJMYXllciAyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMTIuMjggMTE4LjciPgogIDxkZWZzPgogICAgPHN0eWxlPgogICAgICAuY2xzLTEgewogICAgICAgIGZpbGw6IG5vbmU7CiAgICAgICAgc3Ryb2tlOiAjMjMxZjIwOwogICAgICAgIHN0cm9rZS1taXRlcmxpbWl0OiAxMDsKICAgICAgfQogICAgPC9zdHlsZT4KICA8L2RlZnM+CiAgPGcgaWQ9IkxheWVyXzEtMiIgZGF0YS1uYW1lPSJMYXllciAxIj4KICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTS41LjU0djExNy42NmgxMTEuMjhWMy43M3MtNTcuMDQtLjgtNjcuNDEtLjhTLjUuNTQuNS41NFoiLz4KICA8L2c+Cjwvc3ZnPg=="},
    {src:"data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMiIgZGF0YS1uYW1lPSJMYXllciAyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNi4xOSAzMy40MiI+CiAgPGRlZnM+CiAgICA8c3R5bGU+CiAgICAgIC5jbHMtMSB7CiAgICAgICAgZmlsbDogbm9uZTsKICAgICAgICBzdHJva2U6ICMyMzFmMjA7CiAgICAgICAgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOwogICAgICB9CiAgICA8L3N0eWxlPgogIDwvZGVmcz4KICA8ZyBpZD0iTGF5ZXJfMS0yIiBkYXRhLW5hbWU9IkxheWVyIDEiPgogICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMjUuNjksMzIuNnYtOS41N3MtNy41OC0zLjk5LTExLjU3LTguNzdTOS4zNC42OSw5LjM0LjY5TC41NiwzLjg4czIuMzksMTQuMzYsOC4zOCwxOC43NSwxNi43NSw5Ljk3LDE2Ljc1LDkuOTdaIi8+CiAgPC9nPgo8L3N2Zz4="},
    {src:"data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMiIgZGF0YS1uYW1lPSJMYXllciAyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMTguODcgMTY4Ljk1Ij4KICA8ZGVmcz4KICAgIDxzdHlsZT4KICAgICAgLmNscy0xIHsKICAgICAgICBmaWxsOiBub25lOwogICAgICAgIHN0cm9rZTogIzIzMWYyMDsKICAgICAgICBzdHJva2UtbWl0ZXJsaW1pdDogMTA7CiAgICAgIH0KICAgIDwvc3R5bGU+CiAgPC9kZWZzPgogIDxnIGlkPSJMYXllcl8xLTIiIGRhdGEtbmFtZT0iTGF5ZXIgMSI+CiAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0uNjcsNDcuNTlsMTUuNTYsMTE4LjA2czIxLjU0LDIuNzksMzEuNTEsMi43OSwyMy41My0xLjYsMzkuMDktMi43OSwyMy4xMywwLDIzLjEzLDBsOC4zOC0xMTguMDZzLTExLjk3LDAtMTYuNzUtOS41N1M4Mi40NC45Myw3MC4wNy41M3MtMjUuNTMsMy4xOS00My44NywyOC4zMlMuNjcsNDcuNTkuNjcsNDcuNTlaIi8+CiAgPC9nPgo8L3N2Zz4="},
    {src:"data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMiIgZGF0YS1uYW1lPSJMYXllciAyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNC4zNCAxOC40NiI+CiAgPGRlZnM+CiAgICA8c3R5bGU+CiAgICAgIC5jbHMtMSB7CiAgICAgICAgZmlsbDogbm9uZTsKICAgICAgICBzdHJva2U6ICMyMzFmMjA7CiAgICAgICAgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOwogICAgICB9CiAgICA8L3N0eWxlPgogIDwvZGVmcz4KICA8ZyBpZD0iTGF5ZXJfMS0yIiBkYXRhLW5hbWU9IkxheWVyIDEiPgogICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNLjUsOC4xNnY5LjU3czExLjk3LDEuMiwxOS45NC0xLjk5LDEzLjE2LTEyLjc2LDEzLjE2LTEyLjc2bC03Ljk4LTIuMzlzLTUuMTksNy44LTEwLjc3LDguNjlTLjUsOC4xNi41LDguMTZaIi8+CiAgPC9nPgo8L3N2Zz4="},
    {src:"data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMiIgZGF0YS1uYW1lPSJMYXllciAyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxOS4zNSAyMjUuMzMiPgogIDxkZWZzPgogICAgPHN0eWxlPgogICAgICAuY2xzLTEgewogICAgICAgIGZpbGw6IG5vbmU7CiAgICAgICAgc3Ryb2tlOiAjMjMxZjIwOwogICAgICAgIHN0cm9rZS1taXRlcmxpbWl0OiAxMDsKICAgICAgfQogICAgPC9zdHlsZT4KICA8L2RlZnM+CiAgPGcgaWQ9IkxheWVyXzEtMiIgZGF0YS1uYW1lPSJMYXllciAxIj4KICAgIDxwb2x5Z29uIGNsYXNzPSJjbHMtMSIgcG9pbnRzPSIuNSAuNjggOS42NyAzLjQ3IDE4Ljg1IC42OCAxOC4wNSAyMjQuODMgOS42NyAyMjQuODMgLjUgMjI0LjgzIC41IC42OCIvPgogICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNOS42NywzLjQ3djIyMS4zNlYzLjQ3WiIvPgogIDwvZz4KPC9zdmc+"},
    {src:"data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMiIgZGF0YS1uYW1lPSJMYXllciAyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNS43MSA0OS40NiI+CiAgPGRlZnM+CiAgICA8c3R5bGU+CiAgICAgIC5jbHMtMSB7CiAgICAgICAgZmlsbDogbm9uZTsKICAgICAgICBzdHJva2U6ICMyMzFmMjA7CiAgICAgICAgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOwogICAgICB9CiAgICA8L3N0eWxlPgogIDwvZGVmcz4KICA8ZyBpZD0iTGF5ZXJfMS0yIiBkYXRhLW5hbWU9IkxheWVyIDEiPgogICAgPHBvbHlnb24gY2xhc3M9ImNscy0xIiBwb2ludHM9IjIuMyAuNSAzNS4yMSAuNSAzNS4yMSA0My4zOCAzMC4wMiA0OC45NiA2LjQ5IDQ4Ljk2IC41MSA0My4zOCAyLjMgLjUiLz4KICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTS41MSwxMi4wN2gzNC43SC41MVoiLz4KICA8L2c+Cjwvc3ZnPg=="},
    {src:"data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMiIgZGF0YS1uYW1lPSJMYXllciAyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4Ni4wMiAxMzAuNDIiPgogIDxkZWZzPgogICAgPHN0eWxlPgogICAgICAuY2xzLTEgewogICAgICAgIGZpbGw6IG5vbmU7CiAgICAgICAgc3Ryb2tlOiAjMjMxZjIwOwogICAgICAgIHN0cm9rZS1taXRlcmxpbWl0OiAxMDsKICAgICAgfQogICAgPC9zdHlsZT4KICA8L2RlZnM+CiAgPGcgaWQ9IkxheWVyXzEtMiIgZGF0YS1uYW1lPSJMYXllciAxIj4KICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTI3LjI3LDEzLjg1TDYzLjU2LjY5cy44LDcuNTgsNi4zOCwxMy4xNiw5Ljk3LDcuOTgsOS45Nyw3Ljk4bDMuMTksNDMuMDgsMi4zOSw2NS4wMXMtMzkuMDksMC00NS42Ny0xLjYtMzQuOS0zLjk5LTM0LjktMy45OXYtMjcuNTJsLTQuMzktNS45OCwxLjY0LTYuNTcsNC43NC0xOC45NnMxMC4zNywzLjU5LDE4LjM1LTYuNzgsNS41OC0zMi43MSwxLjk5LTQ0LjY3WiIvPgogICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNNTQuNzgsMy44N3M0LjE2LDExLjEzLDguMDcsMTYuMDhjMy4zNyw0LjI2LDE3LjgsMTEuNzYsMTcuOCwxMS43NiIvPgogICAgPHBvbHlsaW5lIGNsYXNzPSJjbHMtMSIgcG9pbnRzPSIyLjE4IDg0LjI2IDQzLjAyIDgxLjI2IDQuOTMgOTYuODEiLz4KICA8L2c+Cjwvc3ZnPg=="},
    {src:"data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMiIgZGF0YS1uYW1lPSJMYXllciAyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4NS41OCAxMjguNzEiPgogIDxkZWZzPgogICAgPHN0eWxlPgogICAgICAuY2xzLTEgewogICAgICAgIGZpbGw6IG5vbmU7CiAgICAgICAgc3Ryb2tlOiAjMjMxZjIwOwogICAgICAgIHN0cm9rZS1taXRlcmxpbWl0OiAxMDsKICAgICAgfQogICAgPC9zdHlsZT4KICA8L2RlZnM+CiAgPGcgaWQ9IkxheWVyXzEtMiIgZGF0YS1uYW1lPSJMYXllciAxIj4KICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTS41LDguMTRzOS45NywxLjIsMTQuMzYsMFMyNC44My41NywyNC44My41N2wzNy4wOSwxMC4zN3MtMy4wOSwzOS42NiwwLDQ4LjY2YzMuMjksOS41Nyw3LjU4LDE3LjE1LDIzLjEzLDE4Ljc1bC0xLjk5LDQ3LjQ2TC41LDEyOC4yVjguMTRaIi8+CiAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0uNSwxNy4zMnMxMC44OCwxLjkzLDE4Ljk1LTEuOTljMTAuMjctNSwxMy42MS0xMi40NiwxMy42MS0xMi40NiIvPgogIDwvZz4KPC9zdmc+"},
    {src:"data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMiIgZGF0YS1uYW1lPSJMYXllciAyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA3OC43OCAyOC45MiI+CiAgPGRlZnM+CiAgICA8c3R5bGU+CiAgICAgIC5jbHMtMSB7CiAgICAgICAgZmlsbDogbm9uZTsKICAgICAgICBzdHJva2U6ICMyMzFmMjA7CiAgICAgICAgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOwogICAgICB9CiAgICA8L3N0eWxlPgogIDwvZGVmcz4KICA8ZyBpZD0iTGF5ZXJfMS0yIiBkYXRhLW5hbWU9IkxheWVyIDEiPgogICAgPHBvbHlnb24gY2xhc3M9ImNscy0xIiBwb2ludHM9Ii41IC41IC41IDE0LjQ2IC41IDI4LjQyIDc4LjI4IDI4LjQyIDc4LjI4IDE0LjQ2IDc4LjI4IC41IC41IC41Ii8+CiAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0uNSwxNC40Nmg3Ny43OEguNVoiLz4KICA8L2c+Cjwvc3ZnPg=="},
    {src:"data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMiIgZGF0YS1uYW1lPSJMYXllciAyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNC41NiA0Ni44NyI+CiAgPGRlZnM+CiAgICA8c3R5bGU+CiAgICAgIC5jbHMtMSB7CiAgICAgICAgZmlsbDogbm9uZTsKICAgICAgICBzdHJva2U6ICMyMzFmMjA7CiAgICAgICAgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOwogICAgICB9CiAgICA8L3N0eWxlPgogIDwvZGVmcz4KICA8ZyBpZD0iTGF5ZXJfMS0yIiBkYXRhLW5hbWU9IkxheWVyIDEiPgogICAgPHBvbHlnb24gY2xhc3M9ImNscy0xIiBwb2ludHM9Ii41IC41IDcuMjggLjUgMTQuMDYgLjUgMTQuMDYgNDYuMzcgNy4yOCA0Ni4zNyAuNSA0Ni4zNyAuNSAuNSIvPgogICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNNy4yOC41djQ1Ljg3Vi41WiIvPgogIDwvZz4KPC9zdmc+"},
    {src:"data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMiIgZGF0YS1uYW1lPSJMYXllciAyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNS43NiA4MC4zNyI+CiAgPGRlZnM+CiAgICA8c3R5bGU+CiAgICAgIC5jbHMtMSB7CiAgICAgICAgZmlsbDogbm9uZTsKICAgICAgICBzdHJva2U6ICMyMzFmMjA7CiAgICAgICAgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOwogICAgICB9CiAgICA8L3N0eWxlPgogIDwvZGVmcz4KICA8ZyBpZD0iTGF5ZXJfMS0yIiBkYXRhLW5hbWU9IkxheWVyIDEiPgogICAgPHBvbHlnb24gY2xhc3M9ImNscy0xIiBwb2ludHM9Ii41IC41IDcuODggLjUgMTUuMjYgLjUgMTUuMjYgNzkuODcgNy44OCA3OS44NyAuNSA3OS44NyAuNSAuNSIvPgogICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNNy44OC41djc5LjM3Vi41WiIvPgogIDwvZz4KPC9zdmc+"}
    ]
  }
};

// ════════════════════════════════════════
//  INIT
// ════════════════════════════════════════
function _wireListeners(){
  const garments = WORKSHOP_DATA.garments;

  const grid = document.getElementById('garment-grid');
  if (!garments.length) {
    grid.innerHTML = '<div class="garment-grid-empty">No garment loaded yet. Use "Import task file from Workshop Console" above to bring in the garment and panel list your researcher assigned.</div>';
  } else {
    garments.forEach(g => {
      const card = document.createElement('div');
      card.className = 'garment-card';
      card.innerHTML = `<img src="${g.src}" alt="${g.name}"><div class="g-check">&#10003;</div>`;
      card.addEventListener('click', () => selectGarment(g, card));
      grid.appendChild(card);
    });
  }

  // panels load when garment is selected
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup',   onMouseUp);
  document.addEventListener('keydown',   onKeyDown);
  document.addEventListener('keyup',     onKeyUp);
  document.getElementById('workspace').addEventListener('mousedown', onWorkspaceMouseDown);
  document.getElementById('workspace').addEventListener('dblclick',  onPenDblClick);
  document.getElementById('garment-overlay').addEventListener('click', onGarmentOverlayClick);
  // Freehand pencil tool — capture phase so it intercepts before the normal
  // pen/drag handlers when active, without needing to touch their logic.
  document.getElementById('workspace').addEventListener('mousedown', freehandPointerDown, true);
  document.addEventListener('mousemove', freehandPointerMove, true);
  document.addEventListener('mouseup', freehandPointerUp, true);

  // ── Ruler drag → create guide (all 4 sides) ──
  // Top ruler → horizontal guide
  document.getElementById('ruler-h').addEventListener('mousedown', e => {
    e.preventDefault();
    const wsRect = document.getElementById('workspace').getBoundingClientRect();
    const pos = Math.max(0, Math.min(WS_H, e.clientY - wsRect.top));
    addGuideFromRuler('h', pos);
  });
  // Bottom ruler → horizontal guide
  document.getElementById('ruler-b').addEventListener('mousedown', e => {
    e.preventDefault();
    const wsRect = document.getElementById('workspace').getBoundingClientRect();
    const pos = Math.max(0, Math.min(WS_H, e.clientY - wsRect.top));
    addGuideFromRuler('h', pos);
  });
  // Left ruler → vertical guide
  document.getElementById('ruler-v').addEventListener('mousedown', e => {
    e.preventDefault();
    const wsRect = document.getElementById('workspace').getBoundingClientRect();
    const pos = Math.max(0, Math.min(WS_W, e.clientX - wsRect.left));
    addGuideFromRuler('v', pos);
  });
  // Right ruler → vertical guide
  document.getElementById('ruler-r').addEventListener('mousedown', e => {
    e.preventDefault();
    const wsRect = document.getElementById('workspace').getBoundingClientRect();
    const pos = Math.max(0, Math.min(WS_W, e.clientX - wsRect.left));
    addGuideFromRuler('v', pos);
  });

  // Viewport scroll → sync all 4 rulers
  document.getElementById('ws-viewport').addEventListener('scroll', function() {
    const tx = `translateX(-${this.scrollLeft}px)`;
    const ty = `translateY(-${this.scrollTop}px)`;
    document.getElementById('ruler-h-inner').style.transform = tx;
    document.getElementById('ruler-b-inner').style.transform = tx;
    document.getElementById('ruler-v-inner').style.transform = ty;
    document.getElementById('ruler-r-inner').style.transform = ty;
  });

  // Mannequin title-bar drag
  document.getElementById('mq-bar').addEventListener('mousedown', e => {
    if (e.target.closest('.mq-rot-btn') || e.target.id === 'mq-close') return;
    e.preventDefault(); e.stopPropagation();
    const win = document.getElementById('mannequin-win');
    const wr  = win.getBoundingClientRect();
    const wsr = document.getElementById('workspace').getBoundingClientRect();
    mqWinDrag = { active:true, sx:e.clientX, sy:e.clientY, ix:wr.left-wsr.left, iy:wr.top-wsr.top };
    win.style.right = 'auto';
    win.style.left  = mqWinDrag.ix + 'px';
    win.style.top   = mqWinDrag.iy + 'px';
  });
  document.getElementById('mq-canvas').addEventListener('mousedown', e => {
    e.stopPropagation();
    mqRotDrag = { active:true, sx:e.clientX };
  });

  setInterval(tickTimers, 1000);

  // (moved here from top-level script end — these touch DOM elements that
  // only exist once getMarkup() has been injected by mount())
  const _tplThumb = document.getElementById('btn-template-thumb');
  if (_tplThumb) _tplThumb.src = TEMPLATE_IMG_SRC;
  ensureIconsRendered();
}

// ════════════════════════════════════════
//  CMD/KEY FEEDBACK
// ════════════════════════════════════════
function onKeyDown(e) {
  if (psReadOnly) return;
  if (e.metaKey || e.ctrlKey) document.getElementById('workspace')?.classList.add('cmd-held');
  if ((e.key==='Delete'||e.key==='Backspace') && selectedIds.size) {
    if (document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA') return;
    e.preventDefault();
    snapshotForUndo();
    [...selectedIds].forEach(id => { wsPanels=wsPanels.filter(p=>p.id!==id); document.getElementById(id)?.remove(); });
    selectedIds.clear(); updateEmptyState();
  } else if (e.key==='Escape') {
    if (penEditMode) { commitPenEdit(); return; }
    if (penMode)  { clearPenState(); togglePenMode(); }
    if (mapMode)  exitMapMode();
  } else if (e.key==='Enter' && (penMode || penEditMode)) {
    e.preventDefault();
    if (penEditMode) { commitPenEdit(); return; }
    finishPen(false);
  } else if ((e.metaKey||e.ctrlKey) && e.key==='z' && penMode) {
    // Undo last pen node (while actively drawing/editing a path)
    e.preventDefault();
    if (penDragging) { penDragging=false; penDragOrigin=null; }
    if (penNodes.length > 0) {
      penNodes.pop();
      renderPenPath();
      renderPenHandles();
      if (penNodes.length > 0) {
        document.getElementById('pen-preview').setAttribute('d', buildPenPreviewD(penMousePos.x, penMousePos.y));
      } else {
        document.getElementById('pen-path').style.display='none';
        document.getElementById('pen-preview').style.display='none';
      }
    }
  } else if ((e.metaKey||e.ctrlKey) && e.key==='z' && !penMode) {
    // General workspace undo
    if (document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA') return;
    e.preventDefault();
    performUndo();
  }
}
function onKeyUp(e) {
  if (!e.metaKey && !e.ctrlKey) document.getElementById('workspace')?.classList.remove('cmd-held');
}

// ════════════════════════════════════════
//  PEN TOOL HELPERS
// ════════════════════════════════════════

function pf(n) { return n.toFixed(1); }

// ── Build SVG path d-string from nodes array ──
function buildPenPathD(nodes, closed) {
  if (nodes.length === 0) return '';
  let d = `M${pf(nodes[0].x)},${pf(nodes[0].y)}`;
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i+1];
    const cp1 = a.handleOut, cp2 = b.handleIn;
    if (!cp1 && !cp2) {
      d += ` L${pf(b.x)},${pf(b.y)}`;
    } else {
      const c1x = cp1 ? cp1.x : a.x, c1y = cp1 ? cp1.y : a.y;
      const c2x = cp2 ? cp2.x : b.x, c2y = cp2 ? cp2.y : b.y;
      d += ` C${pf(c1x)},${pf(c1y)} ${pf(c2x)},${pf(c2y)} ${pf(b.x)},${pf(b.y)}`;
    }
  }
  if (closed) {
    // Closing segment — node[last] → node[0]
    const a = nodes[nodes.length-1], b = nodes[0];
    const cp1 = a.handleOut, cp2 = b.handleIn;
    if (cp1 || cp2) {
      const c1x = cp1 ? cp1.x : a.x, c1y = cp1 ? cp1.y : a.y;
      const c2x = cp2 ? cp2.x : b.x, c2y = cp2 ? cp2.y : b.y;
      d += ` C${pf(c1x)},${pf(c1y)} ${pf(c2x)},${pf(c2y)} ${pf(b.x)},${pf(b.y)}`;
    }
    d += ' Z';
  }
  return d;
}

// ── Preview segment (last node → cursor) ──
function buildPenPreviewD(curX, curY) {
  if (penNodes.length === 0) return '';
  const last = penNodes[penNodes.length - 1];
  const cp1 = last.handleOut;
  if (!cp1) {
    return `M${pf(last.x)},${pf(last.y)} L${pf(curX)},${pf(curY)}`;
  } else {
    return `M${pf(last.x)},${pf(last.y)} C${pf(cp1.x)},${pf(cp1.y)} ${pf(curX)},${pf(curY)} ${pf(curX)},${pf(curY)}`;
  }
}

// ── Render handles + anchor nodes in SVG overlay ──
function renderPenHandles() {
  const ns = 'http://www.w3.org/2000/svg';
  const lG  = document.getElementById('pen-handle-lines');
  const cG  = document.getElementById('pen-handle-circles');
  const nG  = document.getElementById('pen-node-rects');
  lG.innerHTML = ''; cG.innerHTML = ''; nG.innerHTML = '';

  penNodes.forEach((n, i) => {
    const isFirst = i === 0;
    const isLast  = i === penNodes.length - 1;

    // Show handleIn/handleOut lines + circles
    [['handleIn', n.handleIn], ['handleOut', n.handleOut]].forEach(([type, h]) => {
      if (!h) return;
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', pf(n.x)); line.setAttribute('y1', pf(n.y));
      line.setAttribute('x2', pf(h.x)); line.setAttribute('y2', pf(h.y));
      line.setAttribute('stroke', 'rgba(34,136,255,.5)');
      line.setAttribute('stroke-width', '1');
      lG.appendChild(line);

      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', pf(h.x)); c.setAttribute('cy', pf(h.y)); c.setAttribute('r', '5');
      c.setAttribute('fill', '#fff'); c.setAttribute('stroke', '#2288ff'); c.setAttribute('stroke-width', '1.5');
      c.style.cursor = 'pointer';
      // Tag for hit-testing
      c.dataset.nodeIdx = i; c.dataset.handleType = type;
      cG.appendChild(c);
    });

    // Anchor node — circle if smooth, square if corner
    const closeHover = isFirst && penNodes.length > 2 && penHoverClose;
    const isSmooth = !!(n.handleIn || n.handleOut);
    if (isSmooth) {
      const circ = document.createElementNS(ns, 'circle');
      circ.setAttribute('cx', pf(n.x)); circ.setAttribute('cy', pf(n.y)); circ.setAttribute('r', '6');
      circ.setAttribute('fill',   closeHover ? 'rgba(45,190,108,.35)' : penEditMode ? '#fff0cc' : isLast ? '#fff7dd' : '#fff');
      circ.setAttribute('stroke', closeHover ? '#2dbe6c' : '#a06820');
      circ.setAttribute('stroke-width', '1.5');
      circ.style.cursor = 'pointer';
      circ.dataset.nodeIdx = i;
      nG.appendChild(circ);
    } else {
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', pf(n.x - 5)); rect.setAttribute('y', pf(n.y - 5));
      rect.setAttribute('width', '10'); rect.setAttribute('height', '10');
      rect.setAttribute('fill',   closeHover ? 'rgba(45,190,108,.35)' : penEditMode ? '#fff0cc' : isLast ? '#fff7dd' : '#fff');
      rect.setAttribute('stroke', closeHover ? '#2dbe6c' : '#a06820');
      rect.setAttribute('stroke-width', '1.5');
      rect.style.cursor = 'pointer';
      rect.dataset.nodeIdx = i;
      nG.appendChild(rect);
    }
  });
}

// ── Re-render the live path ──
function renderPenPath() {
  const pathEl = document.getElementById('pen-path');
  if (penNodes.length < 1) { pathEl.style.display='none'; pathEl.setAttribute('d',''); return; }
  pathEl.style.display = 'block';
  pathEl.setAttribute('d', buildPenPathD(penNodes, penEditMode ? penEditClosed : false));
}

// ── Finish pen: create panel SVG ──
function buildPenSVG(nodes, closed) {
  const xs = nodes.map(p=>p.x), ys = nodes.map(p=>p.y);
  const pad = 10;
  const minX = Math.min(...xs)-pad, minY = Math.min(...ys)-pad;
  const w    = Math.max(...xs) - Math.min(...xs) + pad*2;
  const h    = Math.max(...ys) - Math.min(...ys) + pad*2;
  const tNodes = nodes.map(n => ({
    x: n.x - minX, y: n.y - minY,
    smooth: n.smooth,
    handleIn:  n.handleIn  ? { x: n.handleIn.x  - minX, y: n.handleIn.y  - minY } : null,
    handleOut: n.handleOut ? { x: n.handleOut.x - minX, y: n.handleOut.y - minY } : null,
  }));
  const d = buildPenPathD(tNodes, closed);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}">
  <path d="${d}" fill="#f5f5f5" stroke="#3a3a3a" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;
  return { svg, src: 'data:image/svg+xml;base64,' + btoa(svg), minX, minY, w, h, tNodes };
}

function finishPen(closed) {
  if (penFinishing) return;
  penFinishing = true;
  if (penNodes.length < 2) { clearPenState(); penFinishing=false; return; }

  const { src, minX, minY, w, tNodes } = buildPenSVG(penNodes, closed);
  snapshotForUndo();
  const np = {
    id: 'wp_pen_'+Date.now()+'_'+Math.random().toString(36).slice(2,5),
    src, x: minX, y: minY, rot:0, flip:false, scale: w/100,
    // Store node data for later path editing
    penData: { nodes: penNodes.map(n => ({
      x: n.x, y: n.y, smooth: n.smooth||false,
      handleIn:  n.handleIn  ? {...n.handleIn}  : null,
      handleOut: n.handleOut ? {...n.handleOut} : null,
    })), closed }
  };
  // Deliberately not selected — leaving a just-finished trace selected kept
  // its resize handles / action icons on screen, obstructing the outline
  // while tracing the next adjacent panel. The workspace should return to a
  // clean drawing state after every completed trace.
  wsPanels.push(np); renderPanel(np); updateEmptyState(); bringToTop(np.id);
  clearPenState();
  setTimeout(()=>{ penFinishing=false; }, 50);
}

// ── Enter edit mode for an existing pen path ──
function enterPenEditMode(panelId) {
  const p = wsPanels.find(p=>p.id===panelId);
  if (!p || !p.penData) return;
  if (penMode) { clearPenState(); }
  penEditMode = true;
  penEditPanelId = panelId;
  penEditClosed = p.penData.closed;
  penEditDragNode = -1;
  penEditDragHandle = null;

  const storedNodes = p.penData.nodes;

  if (p.penData.isMerged) {
    // Merged/traced panels store already-current absolute coordinates and
    // don't support rotate/flip — load directly, no transform needed.
    penNodes = storedNodes.map(n => ({
      x: n.x, y: n.y, smooth: n.smooth||false,
      handleIn:  n.handleIn  ? {...n.handleIn}  : null,
      handleOut: n.handleOut ? {...n.handleOut} : null,
    }));
  } else {
    // Regular pen-drawn panel: penData.nodes store the shape's ORIGINAL
    // (creation-time) absolute coordinates. If the panel has since been
    // moved, rotated, flipped, or rescaled, those stored coordinates no
    // longer match where the shape currently sits on screen — dragging or
    // the resize-handle only update p.x/p.y/p.rot/p.flip/p.scale, never
    // penData.nodes. Map the stored nodes through the panel's CURRENT
    // transform so editing starts exactly where the shape actually is.
    const domEl = document.getElementById(panelId);
    const imgEl = domEl && domEl.querySelector('.pimg');
    const naturalW = imgEl ? imgEl.naturalWidth  : 0;
    const naturalH = imgEl ? imgEl.naturalHeight : 0;
    const pw = Math.round(100*p.scale);
    const ph = naturalW ? pw*(naturalH/naturalW) : pw;
    const xs = storedNodes.map(n=>n.x), ys = storedNodes.map(n=>n.y);
    const pad = 10;
    const minX = Math.min(...xs)-pad, minY = Math.min(...ys)-pad;
    const vbW = Math.max(...xs)-Math.min(...xs)+pad*2, vbH = Math.max(...ys)-Math.min(...ys)+pad*2;
    const sx = pw/vbW, sy = ph/vbH;
    const cosR = Math.cos((p.rot||0)*Math.PI/180), sinR = Math.sin((p.rot||0)*Math.PI/180);
    const flipX = p.flip ? -1 : 1;
    const cxWS = p.x+pw/2, cyWS = p.y+ph/2;
    function toCurrentWS(origX, origY) {
      const lx = (origX-minX)*sx - pw/2, ly = (origY-minY)*sy - ph/2;
      const fx = lx*flipX, fy = ly;
      const rx = fx*cosR - fy*sinR, ry = fx*sinR + fy*cosR;
      return { x: cxWS+rx, y: cyWS+ry };
    }
    penNodes = storedNodes.map(n => {
      const c = toCurrentWS(n.x, n.y);
      return {
        x: c.x, y: c.y, smooth: n.smooth||false,
        handleIn:  n.handleIn  ? toCurrentWS(n.handleIn.x, n.handleIn.y)  : null,
        handleOut: n.handleOut ? toCurrentWS(n.handleOut.x, n.handleOut.y) : null,
      };
    });

    // Bake this transform in immediately: rebuild the panel from these
    // now-current-absolute nodes and reset rot/flip so the underlying image
    // and the edit overlay agree from the very first frame (otherwise the
    // old CSS rotate/flip would still be applied on top of the new geometry).
    if ((p.rot||0) !== 0 || p.flip) {
      snapshotForUndo();
      const built = buildPenSVG(penNodes, p.penData.closed);
      p.src = built.src; p.x = built.minX; p.y = built.minY; p.scale = built.w/100;
      p.rot = 0; p.flip = false;
      p.penData = { nodes: penNodes.map(n => ({
        x: n.x, y: n.y, smooth: n.smooth||false,
        handleIn:  n.handleIn  ? {...n.handleIn}  : null,
        handleOut: n.handleOut ? {...n.handleOut} : null,
      })), closed: p.penData.closed };
      if (domEl) {
        domEl.style.left = p.x+'px'; domEl.style.top = p.y+'px';
        if (imgEl) { imgEl.src = p.src; imgEl.style.width = Math.round(100*p.scale)+'px'; imgEl.style.transform = 'rotate(0deg) scaleX(1)'; }
      }
    }
  }

  // Activate pen mode visuals
  penMode = true;
  document.getElementById('btn-draw').classList.add('on');
  document.getElementById('workspace').classList.add('pen-mode');
  document.getElementById('workspace').classList.add('pen-mode-panels-off');
  document.getElementById('pen-svg').classList.add('edit-mode');
  document.getElementById('pen-path').style.display = 'block';
  document.getElementById('pen-preview').style.display = 'none';
  document.getElementById(panelId)?.classList.add('pen-editing');
  renderPenPath();
  renderPenHandles();
  updateToolbarHint();
}

/// ── Commit edits: rebuild SVG, update panel ──
function commitPenEdit() {
  if (!penEditMode || !penEditPanelId) return;
  const p = wsPanels.find(p=>p.id===penEditPanelId);
  if (p) {
    snapshotForUndo();
    const { src, minX, minY, w, tNodes } = buildPenSVG(penNodes, penEditClosed);
    p.src = src;
    p.x   = minX; p.y = minY; p.scale = w/100;
    p.penData = { nodes: penNodes.map(n => ({
      x: n.x, y: n.y, smooth: n.smooth||false,
      handleIn:  n.handleIn  ? {...n.handleIn}  : null,
      handleOut: n.handleOut ? {...n.handleOut} : null,
    })), closed: penEditClosed };
    const el = document.getElementById(p.id);
    if (el) {
      el.style.left = p.x+'px'; el.style.top = p.y+'px';
      const img = el.querySelector('.pimg');
      if (img) { img.src = p.src; img.style.width = Math.round(100*p.scale)+'px'; }
    }
  }
  exitPenEditMode();
}

function exitPenEditMode() {
  document.getElementById(penEditPanelId)?.classList.remove('pen-editing');
  penEditMode = false; penEditPanelId = null;
  penEditDragNode = -1; penEditDragHandle = null;
  document.getElementById('pen-svg').classList.remove('edit-mode');
  clearPenState();
  // Turn off pen mode
  penMode = false;
  document.getElementById('btn-draw').classList.remove('on');
  document.getElementById('workspace').classList.remove('pen-mode');
  document.getElementById('workspace').classList.remove('pen-mode-panels-off');
  updateToolbarHint();
}

// ── Clear all pen state ──
function clearPenState() {
  penNodes=[]; penDragging=false; penDragOrigin=null; penHoverClose=false;
  penPendingClose=false; penEditDragNode=-1; penEditDragHandle=null;
  document.getElementById('pen-path').style.display='none';
  document.getElementById('pen-path').setAttribute('d','');
  document.getElementById('pen-preview').style.display='none';
  document.getElementById('pen-preview').setAttribute('d','');
  document.getElementById('pen-cursor').setAttribute('cx','-999');
  renderPenHandles();
}

// ════════════════════════════════════════
//  GUIDE SYSTEM
// ════════════════════════════════════════
function addGuideFromRuler(type, pos) {
  if (psReadOnly) return;
  const g = { id:'guide_'+Date.now(), type, pos };
  guides.push(g);
  renderGuide(g);
  guideDrag = { active:true, id:g.id, type };
  updateGuideBtns();
}
function renderGuide(g) {
  const el = document.createElement('div');
  el.className = `guide guide-${g.type}`;
  el.setAttribute('data-guide', g.id);
  el.style[g.type==='h' ? 'top' : 'left'] = g.pos+'px';
  el.innerHTML = `<span class="guide-label">${g.type==='h'?'y':'x'}:${Math.round(g.pos)}</span>`;
  el.addEventListener('mousedown', e => { e.stopPropagation(); guideDrag={ active:true, id:g.id, type:g.type }; });
  el.addEventListener('dblclick',  e => { e.stopPropagation(); removeGuide(g.id); });
  if (!guidesVisible) el.style.display='none';
  document.getElementById('workspace').appendChild(el);
}
function removeGuide(id) {
  guides = guides.filter(g=>g.id!==id);
  document.querySelector(`[data-guide="${id}"]`)?.remove();
  updateGuideBtns();
}
function clearGuides() {
  guides.forEach(g=>document.querySelector(`[data-guide="${g.id}"]`)?.remove());
  guides = []; updateGuideBtns();
}
function toggleGuides() {
  guidesVisible = !guidesVisible;
  document.getElementById('workspace').classList.toggle('guides-hidden', !guidesVisible);
  document.getElementById('btn-guides').classList.toggle('mode-on', guidesVisible);
}
function updateGuideBtns() {
  document.getElementById('btn-clear-guides').style.display = guides.length ? '' : 'none';
}

// ════════════════════════════════════════
//  PANEL TRAY
// ════════════════════════════════════════
function buildPanelTray(panels) {
  const tray = document.getElementById('panel-tray');
  tray.innerHTML = '';  // clear before re-populating
  const trayCountEl = document.getElementById('tray-count');
  if (trayCountEl) trayCountEl.textContent = panels.length;
  if (!panels.length) { tray.innerHTML='<span class="no-panels">No panels uploaded.</span>'; return; }
  panels.forEach(p => {
    const el = document.createElement('div');
    el.className = 'tray-panel';
    el.title = 'Click to show as trace guide · Double-click to place directly';
    el.innerHTML = `<img src="${p.src}" alt="" draggable="false">${p.label?`<div class="tray-panel-label">${_escLabel(p.label)}</div>`:''}`;
    el.addEventListener('click',    () => showTraceOverlay(p.src));
    el.addEventListener('dblclick', e  => { e.stopPropagation(); addPanelToWorkspace(p.src); });
    tray.appendChild(el);
  });
}


// ════════════════════════════════════════
//  TRACE OVERLAY
// ════════════════════════════════════════
function showTraceOverlay(src) {
  // Toggle off if same panel clicked twice
  if (traceOverlaySrc === src) { closeTraceOverlay(); return; }
  traceOverlaySrc = src;
  document.getElementById('trace-overlay-img').src = src;
  document.getElementById('trace-overlay').classList.add('active');
  // Pen tool NOT auto-activated — user selects it manually when ready
}
function closeTraceOverlay() {
  traceOverlaySrc = null;
  document.getElementById('trace-overlay').classList.remove('active');
  document.getElementById('trace-overlay-img').src = '';
}
// Place the original panel image directly into the workspace (from overlay bar)
function placeTracePanel() {
  if (!traceOverlaySrc) return;
  addPanelToWorkspace(traceOverlaySrc);
}

const TEMPLATE_IMG_SRC = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAksAAANFCAYAAABrwLjGAAAACXBIWXMAAAsSAAALEgHS3X78AAAWAklEQVR4nO3dP1IcRx/H4V+7dACjE6jQBVyFD6AAHwHHjuAIInQImVMUKRZHEIEPYKreC4jSCcQR+g2mxxqvdr8CzH8/T9UU2hl2dgnU9Zme2Z1WVW/Gchc+997f39G+AQCqtfb7He7+/Q91t7EEAPBU/VZVr16MB3/23n9/uPcCAHAzd9UwrbU3VVU/3MXOAQCeC7EEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACF5U1Z8P/SYAAB6h91X1ufXeH/qNAAA8Wk7DAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCHo3W2k+ttT8e+n0ALIkl4DH5sap+eug3AbAklgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEET1xr7UtrrY/lU2ttf2X7/ti2v+a5u621j4vnn4x1ffE7b8e2nfv4e4Cnbx5HVpbdNePV3uI5Oyvj0V+ttd3F9t5a+7DyOvN+P615vd5aO7qNv0cswdO3VVUHVfWyqt5V1UlrbXuxfW/lZ1VVjUHqY1Wdjee+rKrzqtpe/M5OVR1V1UHv/fyu/gDg2dmuquq9t8VyVtN4dVjTeHNWVR9aa1tjzPpYVRdV9Xos51X1ceVAbW/Ngdt27/11773VNBYuX/fwNv4YsQTPRO/9svd+PB5uV1W11raqaremQWl3PJ6dVNVx7/14PPey9/5u3jh+92NVvVuuB/iXLnvvlzVFU1XVfFB23ns/6L1fjOWgprFrOTt0WdPYda/EEjwT4+jsqKbBZJ4FmmeTjpePx5HZVk0zUZt8qKp5wAK4S7tVdbpm/enYNjuuqp3l6bv7IJbgeTipqi9V9baqDsdRW9U0yFyM6e/L+jro7FRV9d4vwj53q2p7ZTYK4MqW1w+trN+qacbocnF67iouawqmW7kW6arEEjwP8zVLxzVdszQPPHs1TWPX+DkfjV1UVa1c27Tq5/HzXgcl4PlYXrO0WD0f3O3XuMbomo6raqu19vY23uNViCV4JsY1R/M1AHuLT7/tj6O6+RTc/jiSq1q56Htlf+c1DWT7PgkH3KL54O6sptnwqn8ezC3t1crpuTFzfrx47p0TS/BMLK5ZqpoGl52aprjno7qXY9scPgdVdTS+GmBrLMtrA6r3flrTIHbvF1QCz9cieHbGDPdhTR9COWmtbY/lpKbLAY7XPP+4plNy90IswfMwT2vvVtWvYyDar8UF3GPdu7G+xifcDsbjL2M5qnGKbuGgpgHt3o7igCcvXQ95UVW1nOEeM9m/1HQw92ks21X188rXliz3e7hmXXrdG2u99+//FsA9aK29qarfe+9vHvitAPzNzBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAASt9/7Q7wGgqqpaaz9W1ave+/8e+r0AzMQSAEDgNBwAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAhebNrQWvupqv64x/cCAHBf3vfe31/lFzd+g/e47cBPt/imAAAei8+9989X+UW3OwEACFyzBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEvAo9Bac1dv4FESSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSPHGttZ3W2l+ttd5a+9Ja2x3r+/zvxe/ujvXLZT+s7621o5V9fBivt/Y59/m3A4/XGCM+LsaHk8W2/dbap7H+03LsWDd2pfWL/X0zBo0xsS9eZ2+sXztubiKW4On7UFXnVfWyqn5Z2ba97nHvvS2Wd2H9aVWtDiJ7Y/2m5wD/cSNKPlbVWU1j08uaxqkaQXNUVYdj/WFVHbXW3i52sTp2fW/93srP2dbidc6q6kNrbavyuPkNsQRP33ZVnffeL3vv5733s1vc92lV7YzBpRZHX6e3+BrA83NSVce99+MxNl0uDqaOxrbTsf60qo7H+msb49NuTTG0O49XC5e998uaoqmqaqeuOW6KJXj6zmo6KruLU2DzALI8ajvvvV/cwWsBz0BrbaemGZ1vZpoX21YPuE7H9ng6bIN5fDpeeZxca9wUS/D0/VrTf/yTcU5+53tPWLnOaHvT+nE0dlZfT8XNp+C+uy/gP2unqmrDQdXabYvHNxlDdqvqYswOXda3lw7Ms09HNc0yndU1x02xBE/cmEb+tape1zRQfLjCc5bXGV18Z/1ZVe1tOiLctC/gP+uiqmrDwdPabYvH5zd4vb36Ogt+Vt/OLJ1U1Zeq2q+qg6rrj5tiCZ6JESrHdbMjs2SOo7flFBzwHYvrf745HRa27dU063OtWFqcRttvrfV5vyun1w7q6wXey4vIrzxuiiV44lprb1trW2Oaea9udmS20RhMLmrNKTiADQ5qfMJtHp8W1yMdVtXbxcf492qKmMMN+0p2aoqs1ntvNUXRvP5v45KC45o+sLJ93XFTLMETtviP/mUsWzWdi5+dLL9jpL5OgS+vMzoK62dzJC0/MfK95wD/UeOTbwc1nfqax6ejse24vn5dQB/rD1e+emR17Nq0fr8WF5KPKHo31s8uxrblrFYaN7/Reu/X+fsB7kRrrY8jQ4BHxcwSAEAglgAAArEEABCIJQDg1o2b1S5vpDvfgPtozU245xvd7o6Lvpf7+Xvdpht4b7ph7njO3mL7jT6EIpYAgFs1vmTyY02fRHs9lvOx7nTxUf+qqoPx+HWt/76j7dV/r7mB99ob5o738aG+ftfSjb4nTiwBALftqKYvsT3ovV+M5aDGPdnu6DU33TC3qups5Wa+1yKWAIDbtlvrv8T2tNbcu+0Onde4ncm/uXelWAIAbtvWv3ny8pqkmu7ttnH7ys3A/3HD3DHT9EtNM0yfVm6DcmUvbvZnAADcmZ8X/55vh/K31S+wba1VTVE1h9Wvi989r6rX4+Luk9ba6YioKzOzBADctrNacyPduuI9Jnvv5/NSV78oe+MNc8c+52uZ1r2vyMwSAHDbDqvqr9baSU03sK2aAma3/jlrdKt675etteOq+jhOz23VdKH3aU2RdFk3uCG4mSUA4FaNGaFfagqVT2PZrqqfx7aliw3/3rh9ww28190wd6umSPsyfh5c9xRclRvpAo+EG+kCj5WZJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABC03vtDvwcAgEfLzBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACMQSAEAglgAAArEEABCIJQCAQCwBAAQ/tNbetNbePPQbAQB4TFprv7XWXv1QVW/GAgDAV79V1Sun4QAAArEEABCIJQCAQCwBAARiCQAgEEsAAIFYAgAIxBIAQCCWAAACsQQAEIglAIBALAEABGIJACAQSwAAgVgCAAjEEgBAIJYAAAKxBAAQiCUAgEAsAQAEYgkAIBBLAACBWAIACF6Mn29aa7/fwf4/997f38F+AQCqquqOGqaq6lXVFEt/3tELAAA8Ze+r6vP/AYZOv7ozT4jMAAAAAElFTkSuQmCC";

let templateOverlayOn = false;
function toggleTemplateOverlay() {
  templateOverlayOn = !templateOverlayOn;
  const img = document.getElementById('template-overlay');
  const btn = document.getElementById('btn-template');
  if (templateOverlayOn) {
    if (!img.src) img.src = TEMPLATE_IMG_SRC;
    img.classList.add('visible');
    btn.classList.add('on');
  } else {
    img.classList.remove('visible');
    btn.classList.remove('on');
  }
}

// ════════════════════════════════════════
//  GARMENT OVERLAY
// ════════════════════════════════════════
function toggleGarmentOverlay() {
  if (!selectedGarment) return;
  garmentOverlayOn = !garmentOverlayOn;
  const ov=document.getElementById('garment-overlay'), card=document.getElementById('garment-ref-card');
  if (garmentOverlayOn) {
    document.getElementById('garment-overlay-img').src=selectedGarment.src;
    ov.classList.add('visible'); card.classList.add('ov-on');
  } else {
    ov.classList.remove('visible'); card.classList.remove('ov-on');
    if (mapMode) exitMapMode();
  }
  syncMapPickable();
}

// ════════════════════════════════════════
//  PEN MODE TOGGLE + EVENTS
// ════════════════════════════════════════
// ── Freehand pencil tool: draw a rough stroke, auto-converted into a
// normal editable pen shape (via the same finishPen pipeline the click-based
// Pen tool uses) — refine it afterward with the Pen tool same as Illustrator. ──
let freehandMode = false;
let freehandDrawing = false;
let freehandRawPoints = [];

function toggleFreehandMode() {
  if (penEditMode) { commitPenEdit(); }
  if (penMode) { penMode=false; clearPenState(); document.getElementById('btn-draw')?.classList.remove('on'); }
  freehandMode = !freehandMode;
  // Same clean-slate rule as togglePenMode() — activating a drawing tool
  // always clears any existing selection first.
  if (freehandMode) clearSelection();
  // Select & Move and Freehand are mutually exclusive — turning Freehand on
  // exits Select & Move, turning it back off returns to it (there's no
  // "neither" state once the workshop has started).
  selectMoveMode = !freehandMode;
  document.getElementById('btn-freehand')?.classList.toggle('on', freehandMode);
  document.getElementById('btn-select')?.classList.toggle('on', selectMoveMode);
  const ws = document.getElementById('workspace');
  ws.classList.toggle('pen-mode', freehandMode);
  ws.classList.toggle('pen-mode-panels-off', freehandMode);
  ws.classList.toggle('freehand-mode', freehandMode);
  updateToolbarHint();
}
function freehandPointerDown(e) {
  if (psReadOnly) return;
  if (!freehandMode) return;
  if (e.target.closest('.ws-panel-el') || e.target.tagName === 'BUTTON') return;
  freehandDrawing = true;
  freehandRawPoints = [];
  const wsRect = document.getElementById('workspace').getBoundingClientRect();
  freehandRawPoints.push({ x: e.clientX - wsRect.left, y: e.clientY - wsRect.top });
  e.preventDefault(); e.stopPropagation();
}
function freehandPointerMove(e) {
  if (!freehandMode || !freehandDrawing) return;
  const wsRect = document.getElementById('workspace').getBoundingClientRect();
  const x = e.clientX - wsRect.left, y = e.clientY - wsRect.top;
  const last = freehandRawPoints[freehandRawPoints.length - 1];
  if (!last || Math.hypot(x - last.x, y - last.y) > 3) {
    freehandRawPoints.push({ x, y });
    _renderFreehandPreview();
  }
  e.stopPropagation();
}
function freehandPointerUp(e) {
  if (!freehandMode || !freehandDrawing) return;
  freehandDrawing = false;
  _finishFreehandStroke();
  e.stopPropagation();
}
function _renderFreehandPreview() {
  const path = document.getElementById('pen-path');
  if (!path || freehandRawPoints.length < 2) return;
  const d = 'M' + freehandRawPoints.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' L');
  path.setAttribute('d', d);
  path.style.display = 'block';
}
function _simplifyFreehandPoints(points, minSpacing) {
  if (points.length <= 2) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const last = out[out.length - 1];
    if (Math.hypot(points[i].x - last.x, points[i].y - last.y) >= minSpacing) out.push(points[i]);
  }
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}
function _finishFreehandStroke() {
  const raw = freehandRawPoints;
  freehandRawPoints = [];
  const pathEl = document.getElementById('pen-path');
  if (pathEl) pathEl.style.display = 'none';
  if (raw.length < 3) return; // too short to be a meaningful shape
  const simplified = _simplifyFreehandPoints(raw, 6);
  if (simplified.length < 3) return;
  const first = simplified[0], last = simplified[simplified.length - 1];
  const closeEnough = Math.hypot(first.x - last.x, first.y - last.y) < 24;
  penNodes = simplified.map(p => ({ x: p.x, y: p.y, smooth: false, handleIn: null, handleOut: null }));
  if (closeEnough) penNodes.pop(); // avoid a duplicate point at the closing corner — finishPen(true) closes it
  finishPen(closeEnough);
  // Freehand strokes are rough by nature — the shape lands in the workspace
  // as a normal pen-editable panel, ready to refine with the Pen tool.
}

function togglePenMode() {
  if (freehandMode) { toggleFreehandMode(); }
  if (penEditMode) { commitPenEdit(); return; }
  penMode = !penMode;
  if (!penMode) clearPenState();
  // Activating the tool starts from a clean slate — no leftover selection
  // handles/action icons obstructing the view while drawing.
  if (penMode) clearSelection();
  if (penMode && mapMode) exitMapMode();
  // Select & Move and Pen are mutually exclusive — see toggleFreehandMode().
  selectMoveMode = !penMode;
  document.getElementById('btn-draw').classList.toggle('on', penMode);
  document.getElementById('btn-select')?.classList.toggle('on', selectMoveMode);
  document.getElementById('workspace').classList.toggle('pen-mode', penMode);
  document.getElementById('workspace').classList.toggle('pen-mode-panels-off', penMode);
  updateToolbarHint();
}
// ── Select & Move: the explicit "go back to the safe default" tool.
// Clicking it while a drawing tool is active finishes/cancels that
// interaction (committing an in-progress node edit, or exiting Pen/
// Freehand — clearPenState()/toggleFreehandMode() already discard any
// unfinished, uncommitted path) and returns to plain click-to-select,
// drag-to-move. Clicking it while already active is a no-op. ──
function toggleSelectMoveMode() {
  if (psReadOnly) return;
  if (penEditMode) { commitPenEdit(); }
  if (freehandMode) { toggleFreehandMode(); return; } // already sets selectMoveMode=true + highlights btn-select
  if (penMode) { togglePenMode(); return; }            // same
  if (selectMoveMode) return; // nothing left to finish, already the active tool
  selectMoveMode = true;
  document.getElementById('btn-select')?.classList.add('on');
  updateToolbarHint();
}

// ── Hit-test: is (x,y) within radius r of any node? Returns node index or -1 ──
function hitTestNode(x, y, r) {
  for (let i = 0; i < penNodes.length; i++) {
    if (Math.hypot(x - penNodes[i].x, y - penNodes[i].y) < r) return i;
  }
  return -1;
}
// ── Hit-test: is (x,y) near any handle? Returns {idx, type} or null ──
function hitTestHandle(x, y, r) {
  for (let i = 0; i < penNodes.length; i++) {
    const n = penNodes[i];
    if (n.handleIn  && Math.hypot(x - n.handleIn.x,  y - n.handleIn.y)  < r) return {idx:i, type:'in'};
    if (n.handleOut && Math.hypot(x - n.handleOut.x, y - n.handleOut.y) < r) return {idx:i, type:'out'};
  }
  return null;
}

function onPenMouseDown(e) {
  if (e.target.closest('#mannequin-win')) return;
  if (penFinishing) return;
  e.preventDefault();

  const wsRect = document.getElementById('workspace').getBoundingClientRect();
  const x = e.clientX - wsRect.left;
  const y = e.clientY - wsRect.top;

  // ── EDIT MODE: drag nodes / handles ──
  if (penEditMode) {
    // Handle hit?
    const hHit = hitTestHandle(x, y, PEN_HANDLE_HIT_R);
    if (hHit) { penEditDragHandle = hHit; return; }
    // Node hit?
    const nHit = hitTestNode(x, y, PEN_NODE_HIT_R);
    if (nHit >= 0) { penEditDragNode = nHit; penEditNodeStart = { x, y }; return; }
    // Nothing — no action in edit mode
    return;
  }

  // ── DRAWING MODE ──
  // Close path: click within PEN_CLOSE_R of first node (supports drag for curved close)
  if (penNodes.length > 2) {
    const dx = x - penNodes[0].x, dy = y - penNodes[0].y;
    if (Math.hypot(dx, dy) < PEN_CLOSE_R) {
      penPendingClose = true;
      penDragging     = true;
      penDragOrigin   = { x, y };
      return;
    }
  }

  // Add new anchor node
  penNodes.push({ x, y, smooth: false, handleIn: null, handleOut: null });
  penDragging   = true;
  penDragOrigin = { x, y };
  document.getElementById('pen-path').style.display    = 'block';
  document.getElementById('pen-preview').style.display = 'block';
  renderPenPath();
  renderPenHandles();
}

function onPenMouseMove(e) {
  const wsRect = document.getElementById('workspace').getBoundingClientRect();
  const x = e.clientX - wsRect.left;
  const y = e.clientY - wsRect.top;
  penMousePos = { x, y };

  // ── EDIT MODE ──
  if (penEditMode) {
    if (penEditDragNode >= 0) {
      const n = penNodes[penEditDragNode];
      const dx = x - n.x, dy = y - n.y;
      // Move handles with the node
      if (n.handleIn)  { n.handleIn.x  += dx; n.handleIn.y  += dy; }
      if (n.handleOut) { n.handleOut.x += dx; n.handleOut.y += dy; }
      n.x = x; n.y = y;
      renderPenPath(); renderPenHandles();
      // Live update panel SVG
      liveUpdatePenPanel();
    } else if (penEditDragHandle) {
      const { idx, type } = penEditDragHandle;
      const n = penNodes[idx];
      if (type === 'in') {
        n.handleIn = { x, y };
        n.smooth = true;
        // Mirror handleOut if smooth
        if (n.handleOut) {
          const dx = n.x - x, dy = n.y - y;
          n.handleOut = { x: n.x + dx, y: n.y + dy };
        }
      } else {
        n.handleOut = { x, y };
        n.smooth = true;
        if (n.handleIn) {
          const dx = n.x - x, dy = n.y - y;
          n.handleIn = { x: n.x + dx, y: n.y + dy };
        }
      }
      renderPenPath(); renderPenHandles();
      liveUpdatePenPanel();
    }
    return;
  }

  // ── DRAWING MODE ──
  const cur = document.getElementById('pen-cursor');
  cur.setAttribute('cx', pf(x)); cur.setAttribute('cy', pf(y));

  // Close hover detection
  if (penNodes.length > 2 && !penDragging) {
    const dx = x - penNodes[0].x, dy = y - penNodes[0].y;
    const wasHover = penHoverClose;
    penHoverClose = Math.hypot(dx, dy) < PEN_CLOSE_R;
    cur.setAttribute('r',      penHoverClose ? '10' : '5');
    cur.setAttribute('stroke', penHoverClose ? '#2dbe6c' : '#a06820');
    cur.setAttribute('fill',   penHoverClose ? 'rgba(45,190,108,.2)' : 'none');
    if (penHoverClose !== wasHover) renderPenHandles();
  }

  // Drag: pending close sets handleIn on first node
  if (penDragging && penPendingClose && penNodes.length > 0) {
    const first = penNodes[0];
    const dx = x - penDragOrigin.x, dy = y - penDragOrigin.y;
    if (Math.hypot(dx, dy) > PEN_DRAG_THRESH) {
      first.handleIn  = { x: first.x - dx, y: first.y - dy };
      first.handleOut = { x: first.x + dx, y: first.y + dy };
      first.smooth = true;
    } else {
      first.handleIn = null; first.handleOut = null; first.smooth = false;
    }
    renderPenPath(); renderPenHandles();
    return;
  }

  // Drag: set handles on last placed node
  if (penDragging && penNodes.length > 0) {
    const last = penNodes[penNodes.length - 1];
    const dx = x - penDragOrigin.x, dy = y - penDragOrigin.y;
    if (Math.hypot(dx, dy) > PEN_DRAG_THRESH) {
      last.handleOut = { x: last.x + dx, y: last.y + dy };
      last.handleIn  = { x: last.x - dx, y: last.y - dy };
      last.smooth = true;
    } else {
      last.handleOut = null; last.handleIn = null; last.smooth = false;
    }
    renderPenPath();
    renderPenHandles();
  }

  // Live preview segment
  if (penNodes.length > 0) {
    document.getElementById('pen-preview').setAttribute('d', buildPenPreviewD(x, y));
  }
}

function onPenMouseUp(e) {
  if (!penMode && !penEditMode) return;

  // Edit mode: release drag
  if (penEditMode) {
    if (penEditDragNode >= 0 && penEditNodeStart) {
      const wsRect = document.getElementById('workspace').getBoundingClientRect();
      const ux = e.clientX - wsRect.left, uy = e.clientY - wsRect.top;
      const moved = Math.hypot(ux - penEditNodeStart.x, uy - penEditNodeStart.y);
      if (moved < PEN_DRAG_THRESH) {
        // Click (no real drag) on an anchor node → toggle corner ↔ smooth
        const n = penNodes[penEditDragNode];
        n.x = penEditNodeStart.x; n.y = penEditNodeStart.y; // snap back in case of tiny jitter
        if (n.smooth) {
          n.handleIn = null; n.handleOut = null; n.smooth = false;
        } else {
          const prev = penNodes[(penEditDragNode - 1 + penNodes.length) % penNodes.length];
          const next = penNodes[(penEditDragNode + 1) % penNodes.length];
          const dx = (next.x - prev.x) * 0.35;
          const dy = (next.y - prev.y) * 0.35;
          n.handleOut = { x: n.x + dx, y: n.y + dy };
          n.handleIn  = { x: n.x - dx, y: n.y - dy };
          n.smooth = true;
        }
        renderPenPath(); renderPenHandles(); liveUpdatePenPanel();
      }
    }
    penEditDragNode = -1; penEditDragHandle = null; penEditNodeStart = null;
    return;
  }

  // Pending close with drag → finish
  if (penPendingClose) {
    penPendingClose = false; penDragging = false; penDragOrigin = null;
    finishPen(true);
    return;
  }

  if (penDragging) {
    penDragging = false; penDragOrigin = null;
    const wsRect = document.getElementById('workspace').getBoundingClientRect();
    document.getElementById('pen-preview').setAttribute('d',
      buildPenPreviewD(e.clientX - wsRect.left, e.clientY - wsRect.top));
  }
}

// Double-click → finish open path (drawing) OR toggle anchor type (edit)
function onPenDblClick(e) {
  e.preventDefault();

  const wsRect = document.getElementById('workspace').getBoundingClientRect();
  const x = e.clientX - wsRect.left;
  const y = e.clientY - wsRect.top;

  // EDIT MODE: node toggling is now handled by a single click (see onPenMouseUp) —
  // a double-click here is just two single-click toggles in a row, so nothing extra to do.
  if (penEditMode) return;

  // DRAWING MODE: finish open path
  if (!penMode) return;
  if (penNodes.length > 1) penNodes.pop(); // remove extra node from 2nd click
  finishPen(false);
}

// ── Live-update panel image during edit (debounced) ──
let _liveUpdateTimer = null;
function liveUpdatePenPanel() {
  clearTimeout(_liveUpdateTimer);
  _liveUpdateTimer = setTimeout(() => {
    const p = wsPanels.find(p=>p.id===penEditPanelId); if (!p) return;
    const { src, minX, minY, w } = buildPenSVG(penNodes, penEditClosed);
    p.src = src; p.x = minX; p.y = minY; p.scale = w/100;
    const el = document.getElementById(p.id);
    if (el) {
      el.style.left = p.x+'px'; el.style.top = p.y+'px';
      const img = el.querySelector('.pimg'); if (img) { img.src = src; img.style.width = Math.round(100*p.scale)+'px'; }
    }
  }, 40); // 40ms debounce
}

// ════════════════════════════════════════
//  MAP MODE
// ════════════════════════════════════════
function toggleMapMode() { if (mapMode) exitMapMode(); else enterMapMode(); }
function enterMapMode() {
  if (!selectedGarment) { alert('Please select a garment first.'); return; }
  if (!garmentOverlayOn) toggleGarmentOverlay();
  mapMode=true; if (penMode) { clearPenState(); togglePenMode(); }
  document.getElementById('btn-map').classList.add('mode-on');
  document.getElementById('workspace').classList.add('map-mode');
  syncMapPickable(); updateMapBanner(); updateToolbarHint();
}
function exitMapMode() {
  mapMode=false; pendingMapNum=null;
  document.getElementById('btn-map').classList.remove('mode-on');
  document.getElementById('workspace').classList.remove('map-mode');
  document.getElementById('map-banner').classList.remove('visible');
  syncMapPickable(); updateToolbarHint();
}
function syncMapPickable() {
  const ov=document.getElementById('garment-overlay');
  if (mapMode&&garmentOverlayOn) ov.classList.add('map-pick'); else ov.classList.remove('map-pick');
}
function updateMapBanner() {
  const banner=document.getElementById('map-banner');
  if (!mapMode) { banner.classList.remove('visible'); return; }
  banner.classList.add('visible');
  const s1=document.getElementById('map-step-1'), s2=document.getElementById('map-step-2');
  if (pendingMapNum===null) {
    s1.className='map-step active';  s1.textContent='① Click a panel';
    s2.className='map-step pending'; s2.textContent='② Click garment location';
  } else {
    s1.className='map-step done';    s1.textContent=`✓ Panel #${pendingMapNum} assigned`;
    s2.className='map-step active';  s2.textContent='② Now click the matching spot on the garment';
  }
}
function onGarmentOverlayClick(e) {
  if (psReadOnly) return;
  if (!mapMode||pendingMapNum===null) return;
  const rect=document.getElementById('garment-overlay').getBoundingClientRect();
  placeMapPin(pendingMapNum, e.clientX-rect.left, e.clientY-rect.top);
  pendingMapNum=null; updateMapBanner();
}
function mapPanel(panelId) {
  if (panelMappings[panelId]!==undefined) {
    const num=panelMappings[panelId];
    garmentPinEls[num]?.remove(); delete garmentPinEls[num];
    delete panelMappings[panelId]; setBadge(panelId,null);
    if (pendingMapNum===num) pendingMapNum=null;
    updateMapBanner(); return;
  }
  const num=mapCounter++;
  panelMappings[panelId]=num; setBadge(panelId,num);
  pendingMapNum=num; updateMapBanner();
}
function placeMapPin(num,x,y) {
  garmentPinEls[num]?.remove();
  const pin=document.createElement('div');
  pin.className='map-pin'; pin.dataset.num=num; pin.textContent=num;
  pin.style.left=x+'px'; pin.style.top=y+'px';
  document.getElementById('garment-overlay').appendChild(pin);
  garmentPinEls[num]=pin;
}
function setBadge(panelId,num) {
  const b=document.getElementById('badge-'+panelId); if (!b) return;
  b.textContent=num??''; b.style.display=num!==null?'flex':'none';
}

// ════════════════════════════════════════
//  3D MANNEQUIN
// ════════════════════════════════════════
function toggleMannequin() {
  const win=document.getElementById('mannequin-win');
  const on=win.classList.toggle('visible');
  document.getElementById('btn-mq').classList.toggle('mode-on',on);
  if (on&&!mqInited) { mqInited=true; initMannequin(); }
}
function closeMannequin() {
  document.getElementById('mannequin-win').classList.remove('visible');
  document.getElementById('btn-mq').classList.remove('mode-on');
}
function rotateMQ(rad) { if (mqMesh) mqMesh.rotation.y+=rad; }
function toggleAutoSpin() {
  mqAutoSpin=!mqAutoSpin;
  document.getElementById('mq-spin-btn').classList.toggle('spin-on',mqAutoSpin);
}
function initMannequin() {
  if (!window.THREE) { document.getElementById('mq-foot').textContent='Three.js not loaded.'; return; }
  const canvas=document.getElementById('mq-canvas');
  mqScene=new THREE.Scene(); mqScene.background=new THREE.Color(0xe8e8e4);
  mqCamera=new THREE.PerspectiveCamera(36,270/360,0.1,100);
  mqCamera.position.set(0,0.15,2.8); mqCamera.lookAt(0,0.05,0);
  mqRenderer=new THREE.WebGLRenderer({canvas,antialias:true});
  mqRenderer.setSize(270,360); mqRenderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  mqScene.add(new THREE.AmbientLight(0xffffff,0.65));
  const d1=new THREE.DirectionalLight(0xfff5e8,0.9); d1.position.set(1.5,2,2); mqScene.add(d1);
  const d2=new THREE.DirectionalLight(0xe8f0ff,0.4); d2.position.set(-1,1,-1); mqScene.add(d2);
  mqMesh=new THREE.Group();
  const profile=[
    new THREE.Vector2(0.01,-0.52),new THREE.Vector2(0.26,-0.50),new THREE.Vector2(0.31,-0.35),
    new THREE.Vector2(0.31,-0.14),new THREE.Vector2(0.19,0.09),new THREE.Vector2(0.22,0.22),
    new THREE.Vector2(0.29,0.38),new THREE.Vector2(0.27,0.50),new THREE.Vector2(0.19,0.60),
    new THREE.Vector2(0.10,0.68),new THREE.Vector2(0.07,0.74),new THREE.Vector2(0.07,0.78),
  ];
  const bodyMat=new THREE.MeshPhongMaterial({color:0xf0ece6,shininess:22,specular:0x999988});
  mqMesh.add(new THREE.Mesh(new THREE.LatheGeometry(profile,72),bodyMat));
  const poleMat=new THREE.MeshPhongMaterial({color:0x7a6050,shininess:40});
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.62,16),poleMat);
  pole.position.y=-0.83; mqMesh.add(pole);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.25,0.045,40),poleMat);
  base.position.y=-1.15; mqMesh.add(base);
  mqScene.add(mqMesh);
  (function animate(){ requestAnimationFrame(animate); if(mqAutoSpin&&mqMesh) mqMesh.rotation.y+=0.008; mqRenderer.render(mqScene,mqCamera); })();
}

// ════════════════════════════════════════
//  GARMENT SELECTION
// ════════════════════════════════════════
function selectGarment(g,card) {
  document.querySelectorAll('.garment-card').forEach(c=>c.classList.remove('selected'));
  card.classList.add('selected'); selectedGarment=g;
  document.getElementById('start-btn').classList.add('active');
  buildPanelTray(WORKSHOP_DATA.panels[g.name] || []);
}
function startWorkshop() {
  document.getElementById('screen-select').style.display='none';
  document.getElementById('screen-workshop').classList.add('active');
  sessionStart=Date.now(); sessionRunning=true; workshopStarted=true;
  if (selectedGarment) document.getElementById('ws-garment-img').src=selectedGarment.src;
  else document.getElementById('garment-ref-card').style.display='none';
}
function changeGarment() {
  document.getElementById('screen-workshop').classList.remove('active');
  document.getElementById('screen-select').style.display='flex';
}

// ════════════════════════════════════════
//  IMPORT TASK FILE  (from Workshop Console)
// ════════════════════════════════════════
const CONSOLE_SHAPE_PATHS = {
  bodice:'M8 6 Q20 0 32 6 L34 14 L40 22 L34 26 L33 48 L7 48 L6 26 L0 22 L6 14 Z',
  back:'M9 6 Q20 3 31 6 L34 14 L40 22 L34 26 L33 48 L7 48 L6 26 L0 22 L6 14 Z',
  sleeve:'M6 4 Q20 -2 34 4 L30 48 L10 48 Z',
  collar:'M4 30 Q20 6 36 30 L30 38 Q20 22 10 38 Z',
  cuff:'M6 16 L34 16 L34 34 L6 34 Z',
  skirt:'M12 4 L28 4 L38 48 L2 48 Z',
  pocket:'M9 12 L31 12 L31 32 L20 40 L9 32 Z',
  yoke:'M4 20 Q20 8 36 20 L34 30 Q20 22 6 30 Z'
};
function shapeToDataURL(shape, label){
  const d = CONSOLE_SHAPE_PATHS[shape];
  const inner = d
    ? `<path d="${d}" fill="#efe9dd" stroke="#1a1a1a" stroke-width="1.4"/>`
    : `<rect x="3" y="3" width="34" height="44" rx="3" fill="#efe9dd" stroke="#1a1a1a" stroke-width="1.4"/><text x="20" y="27" font-size="6" text-anchor="middle" fill="#555" font-family="monospace">${(label||'panel').replace(/[<>&]/g,'').slice(0,10)}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="275" viewBox="0 0 40 50">${inner}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function handleTaskFileInput(input){
  const f = input.files && input.files[0];
  if(!f) return;
  const r = new FileReader();
  r.onload = () => {
    try { applyTaskFile(JSON.parse(r.result)); }
    catch(e){ alert('Could not read the task file:\n' + e.message); }
    input.value = '';
  };
  r.readAsText(f);
}
function toggleLeftPanel(){
  const lp = document.querySelector('.left-panel');
  if(!lp) return;
  const hidden = lp.classList.toggle('collapsed');
  const b = document.getElementById('lp-toggle');
  if(b){ b.classList.toggle('on', !hidden); b.title = hidden ? 'Show plan panel' : 'Hide plan panel'; }
}
function applyTaskFile(t){
  if(!t || !t.flatform_task){ alert('This does not look like a Workshop Console task file.'); return; }
  // flush any existing garment / workspace so we start clean from the imported one
  try { clearWorkspace(); } catch(e){}
  try { closeTraceOverlay(); } catch(e){}
  try { if(garmentOverlayOn) toggleGarmentOverlay(); } catch(e){}
  const g = t.garment || {};
  currentTaskMeta = t;
  // Fresh load always starts fully locked — Participant calls
  // setReferenceUnlockState() right after this returns (loadTaskIntoPanelStudio)
  // with whatever the real derived count is, correctly re-locking/unlocking
  // to match a resumed package instead of staying at these zeroed defaults.
  referenceUnlockCount = 0;
  referenceActiveKey = null;
  const refs = t.references;
  const cardImg = refs ? _referenceImageSrc(refs.primary) : (g.image||'');
  selectedGarment = { name: g.name || 'Task garment', src: cardImg };
  _refreshPanelTray();
  setTaskBanner(t);
  renderPlanPanel(t);
  renderScaffoldIcons(g, t.stage);
  // enter workshop
  document.getElementById('screen-select').style.display = 'none';
  document.getElementById('screen-workshop').classList.add('active');
  sessionStart = Date.now(); sessionRunning = true; workshopStarted = true;
  const gc = document.getElementById('garment-ref-card');
  if(gc) gc.style.display = refs ? '' : 'none';
  // Task brief panel stays visible throughout (no auto-collapse) — matches
  // the redesigned always-visible left panel; the old collapsible "Plan"
  // slide-out is retired along with its toggle button.
  const stageBadge = document.getElementById('ps-stage-badge');
  if (stageBadge) stageBadge.textContent = _taskStageName();
  const ws = document.getElementById('workspace');
  if (ws) ws.dataset.cornerLabel = 'A4 · ' + _taskStageName().toUpperCase() + (t.participantCode?(' · '+t.participantCode):'');
}
// ── Progressive Reference (Hint) system state ──────────────────────────
// referenceUnlockCount: how many of currentTaskMeta.references.additional
// are unlocked, kept in sync by Participant via setReferenceUnlockState()
// (derived there from PKG.lifecycleLog — Panel Studio holds no source of
// truth of its own, per invariant #3). referenceActiveKey: which
// additional reference (by key) is the one currently shown in the frame,
// or null when the frame is showing the Primary Task Reference.
let referenceUnlockCount = 0;
let referenceActiveKey = null;
var _onReferenceEventCallbacks = [];
function onReferenceEvent(cb){ if(typeof cb === 'function') _onReferenceEventCallbacks.push(cb); }
function _fireReferenceEvent(action, refKey){
  const stage = currentTaskMeta ? currentTaskMeta.stage : null;
  _onReferenceEventCallbacks.forEach(function(cb){ try{ cb(action, refKey, stage); }catch(err){ console.error(err); } });
}
// Resolves a reference's image src from its `field` against the task's
// garment object — the same fields renderScaffoldIcons used individually
// before this system existed (image/frontBackImage/flatSketchImage/
// groupPanelImage/scaffold4Image), just looked up generically by name now.
function _referenceImageSrc(ref){
  const g = (currentTaskMeta && currentTaskMeta.garment) || {};
  return ref && ref.field ? (g[ref.field] || '') : '';
}
// Index of the 'panels'-type reference within the current stage's
// additional list, or -1 if this stage has none (pretest/posttest never
// do). Whether it's unlocked is then just referenceUnlockCount > that
// index, consistent with the same 1-based-count-vs-0-based-index relation
// used everywhere else here.
function _panelsRefIndex(){
  const refs = currentTaskMeta && currentTaskMeta.references;
  if(!refs) return -1;
  return refs.additional.findIndex(function(r){ return r.type==='panels'; });
}
function _individualPanelsUnlocked(){
  const idx = _panelsRefIndex();
  return idx>=0 && referenceUnlockCount > idx;
}
// Rebuilds the panel tray from whichever source is currently correct
// (individual panels once unlocked, basic/starting panels otherwise) and
// shows/hides the tray row itself. Stage 2 has no tray at all until its
// 'panels' reference is revealed (matching its existing "not a
// tray-arrangement task" design — see applyTaskFile's prior isStage2
// special case); Stage 1/3 show the basic tray from the very start and
// swap in place, never hiding the row.
function _refreshPanelTray(){
  const t = currentTaskMeta;
  if(!t) return;
  const isStage2 = t.stage === 's2';
  const unlocked = _individualPanelsUnlocked();
  const traySt = document.querySelector('.ps-tray-row');
  const showTray = isStage2 ? unlocked : true;
  if (traySt) traySt.style.display = showTray ? '' : 'none';
  if (!showTray) { buildPanelTray([]); return; }
  const source = unlocked ? (t.individualPanelTray||[]) : (t.panels||[]);
  const panels = source.map(function(p){ return { src: p.image ? p.image : shapeToDataURL(p.shape, p.label), label: p.label || '' }; });
  buildPanelTray(panels);
}
// Called by Participant on every load and after every reveal — the single
// place tab/tray rendering reacts to a changed unlock count, whether that
// change just happened (a reveal click) or is being restored from a
// reopened, already-partially-revealed package.
function setReferenceUnlockState(n){
  referenceUnlockCount = Math.max(0, n|0);
  _refreshPanelTray();
  if (currentTaskMeta) renderScaffoldIcons(currentTaskMeta.garment||{}, currentTaskMeta.stage);
}
// ── Reference tabs (Progressive Reference / Hint system) ──────────────
// Replaces the old "show every available image as an always-unlocked tab"
// renderer. Tab 0 is always the Primary Task Reference (unlocked, never
// logged — it isn't a hint). Each additional reference after it is either
// already revealed (clickable, re-viewable), the next one eligible to
// reveal (clickable — clicking it IS the reveal action), or still locked
// (visible so the participant knows more help exists, but not clickable —
// "never skip directly to the strongest reference"). 'panels'-type entries
// never change the frame image; revealing one only unlocks the tray (see
// _refreshPanelTray) and, once revealed, has nothing further to toggle.
function renderScaffoldIcons(g, stage){
  const list = document.getElementById('ps-image-tabs');
  if (!list) return;
  const refs = currentTaskMeta && currentTaskMeta.references;
  if (!refs){ window._scaffoldItems = []; list.innerHTML=''; return; }
  const tabs = [{ key:refs.primary.key, label:refs.primary.label, src:_referenceImageSrc(refs.primary), kind:'primary', locked:false, revealed:true }];
  refs.additional.forEach(function(r, i){
    const revealed = i < referenceUnlockCount;
    const nextToReveal = i === referenceUnlockCount;
    tabs.push({
      key:r.key, label:r.label,
      src: r.type==='panels' ? null : _referenceImageSrc(r),
      kind: r.type==='panels' ? 'panels' : 'image',
      locked: !revealed && !nextToReveal,
      revealed: revealed
    });
  });
  window._scaffoldItems = tabs;
  list.innerHTML = tabs.map(function(tab, idx){
    const isActive = tab.kind==='primary' ? (referenceActiveKey===null) : (referenceActiveKey===tab.key);
    const classes = ['ps-image-tab'];
    if (isActive) classes.push('on');
    if (tab.locked) classes.push('ps-ref-locked');
    if (tab.kind!=='primary' && tab.revealed && !isActive) classes.push('ps-ref-done');
    const prefix = tab.locked ? '🔒 ' : (tab.kind==='panels' && tab.revealed ? '✓ ' : '');
    return `<button type="button" class="${classes.join(' ')}" data-idx="${idx}" ${tab.locked?'disabled':''} onclick="_onReferenceTabClick(${idx})">${prefix}${_escLabel(tab.label)}</button>`;
  }).join('');
}
// Visual-only update (frame image + active tab state); never fires a
// reference event itself — callers that need logging fire it separately,
// so Primary (never logged) can share this same code path.
function _setActiveReferenceView(key, src){
  referenceActiveKey = key;
  const gi = document.getElementById('ws-garment-img'); if (gi && src) gi.src = src;
  if (selectedGarment && src) selectedGarment.src = src;
  // Same "tab clicks never touch the overlay's own visibility" rule the
  // old toggleScaffoldOverlay() followed — only what *would* show if the
  // overlay is toggled changes here; clicking the frame image itself is
  // still the only way to actually turn the on-canvas overlay on/off.
  if (garmentOverlayOn) toggleGarmentOverlay();
  if (currentTaskMeta) renderScaffoldIcons(currentTaskMeta.garment||{}, currentTaskMeta.stage);
}
function _onReferenceTabClick(idx){
  const tabs = window._scaffoldItems || [];
  const tab = tabs[idx];
  if (!tab || tab.locked) return;
  // Read-only review (Review Submission — the task is already finished):
  // switching among the Primary reference and already-revealed ones is
  // still pure viewing and stays allowed, matching this mode's "only
  // viewing... should remain available" scope. Revealing something for the
  // first time would create a new hint-dependence data point after the
  // problem-solving process it's meant to measure is over, so that's
  // blocked outright — a not-yet-revealed tab is only ever reachable here
  // as the single "next to reveal" one (tab.locked already hides the rest).
  if (psReadOnly && !tab.revealed && tab.kind!=='primary') return;
  if (tab.kind==='primary'){ _setActiveReferenceView(null, tab.src); return; }
  if (tab.kind==='panels'){
    // One-way reveal — no hide/toggle, no frame change; the tray swap
    // itself happens in _refreshPanelTray() once Participant calls
    // setReferenceUnlockState() back with the incremented count.
    if (!tab.revealed) _fireReferenceEvent('shown', tab.key);
    return;
  }
  if (referenceActiveKey === tab.key){
    // Hide → revert to Primary. Not logged while read-only — switching
    // during review is viewing, not a new behavioural data point.
    if (!psReadOnly) _fireReferenceEvent('hidden', tab.key);
    _setActiveReferenceView(null, tabs[0].src);
  } else {
    if (!psReadOnly){
      if (referenceActiveKey) _fireReferenceEvent('hidden', referenceActiveKey);
      _fireReferenceEvent('shown', tab.key);
    }
    _setActiveReferenceView(tab.key, tab.src);
  }
}
function _escLabel(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function deleteSelectedPanels(){
  if (!selectedIds.size) { alert('Select one or more panels first, then click Delete.'); return; }
  snapshotForUndo();
  [...selectedIds].forEach(id=>{
    if (panelMappings[id]!==undefined) {
      const num=panelMappings[id];
      garmentPinEls[num]?.remove(); delete garmentPinEls[num]; delete panelMappings[id];
    }
    wsPanels=wsPanels.filter(p=>p.id!==id);
    document.getElementById(id)?.remove();
  });
  selectedIds.clear();
  updateEmptyState();
  updateMergeBtn();
}
function moveAllTrayPanelsToWorkspace(){
  if (psReadOnly) return;
  const imgs=[...document.querySelectorAll('#panel-tray .tray-panel img')];
  imgs.forEach(img=>addPanelToWorkspace(img.src));
}
// ── Task brief panel: garment name/complexity, brief text, image frame +
// tab-switcher, populated from the task-transfer object's own fields (t.brief/
// t.budgetMin are read here — new, additive fields on that in-memory object,
// not a PKG schema change). Replaces the old collapsible "Plan" instructions
// panel; "Mark task complete" now lives in the studio-header's Finish button. ──
function renderPlanPanel(t){
  const el = document.getElementById('plan-panel-content');
  if (!el) return;
  const g = t.garment || {};
  const bits = [];
  if (g.name) bits.push(g.name);
  if (t.complexity) bits.push(t.complexity);
  if (t.styleLine) bits.push('style line: '+t.styleLine);
  // Same Primary-reference resolution applyTaskFile()/renderScaffoldIcons()
  // use — this used to independently recompute its own isStage2-based
  // image choice, which could silently disagree with what the reference
  // system considers Primary. One source of truth now.
  const refs = t.references;
  const cardImg = refs ? _referenceImageSrc(refs.primary) : (g.image || '');
  el.innerHTML = `
    <div class="ps-brief-eyebrow">Task brief${bits.length?' · '+bits.map(_escLabel).join(' · '):''}</div>
    <p class="ps-brief-text">${_escLabel(t.brief||'')}</p>
    <div id="garment-ref-card" onclick="toggleGarmentOverlay()" title="Click to show/hide this image as a trace reference on the canvas">
      <img id="ws-garment-img" src="${cardImg}" alt="">
      <div class="ov-dot"></div>
    </div>
    <div class="ps-image-tabs" id="ps-image-tabs"></div>
    <p class="ps-brief-note">Extra references are optional — reveal one only if you want more help. Once revealed, it stays available.</p>
  `;
}
function setTaskBanner(t){
  // Retired: this info now lives in the Plan panel's header (renderPlanPanel)
  // instead of a separate strip above the workspace. Just clean up any old one.
  const b = document.getElementById('task-banner');
  if (b) b.remove();
}

// ════════════════════════════════════════
//  TASKS / HINTS / PROGRESS
// ════════════════════════════════════════
function toggleTask(tid) {
  document.getElementById(tid).classList.toggle('open');
}
function toggleHint(hid,btn) {
  const show=document.getElementById(hid).classList.toggle('show');
  btn.textContent=show?'💡 Hide hint':'💡 Show hint';
}
function markDone(sid,cbid,tid) {
  const cb=document.getElementById(cbid);
  document.getElementById(sid).classList.toggle('done',cb.checked);
  const st=document.getElementById('stimer-'+sid);
  if (st) st.textContent=cb.checked?'+'+formatTime(getTaskElapsed(tid)):'';
  updateProgress();
}
function updateProgress() {
  const done=document.querySelectorAll('#screen-workshop input[type="checkbox"]:checked').length;
  const pt=document.getElementById('prog-text'); if(pt) pt.textContent=`${done} / ${TOTAL} complete`;
  const pf=document.getElementById('prog-fill'); if(pf) pf.style.width=`${(done/TOTAL)*100}%`;
  const cbnr=document.getElementById('completion-banner'); if(cbnr) cbnr.classList.toggle('show',done===TOTAL);
}

// ════════════════════════════════════════
//  TIMERS
// ════════════════════════════════════════
function toggleTimer(tid) {
  const t = timers[tid];
  const el = document.getElementById('timer-'+tid);
  if (!el) return;
  if (t.running) {
    // Pause
    t.elapsed += Date.now() - t.startedAt;
    t.running = false;
    el.classList.remove('running');
    el.querySelector('.t-icon').textContent = '▶';
  } else {
    // Start
    t.startedAt = Date.now();
    t.running = true;
    el.classList.add('running');
    el.querySelector('.t-icon').textContent = '⏸';
  }
}
function getTaskElapsed(tid) { const t=timers[tid]; return t.running?t.elapsed+(Date.now()-t.startedAt):t.elapsed; }
function formatTime(ms) { const s=Math.floor(ms/1000); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }
function toggleSessionTimer() {
  const el = document.getElementById('total-timer');
  const icon = document.getElementById('total-timer-icon');
  if (sessionRunning) {
    // Pause overall → also pause any running task timers
    sessionElapsed += Date.now() - sessionStart;
    sessionRunning = false;
    el.classList.add('paused');
    icon.textContent = '▶';
    taskIds.forEach(tid => { if (timers[tid].running) toggleTimer(tid); });
  } else {
    // Resume overall only — individual timers stay as they are
    sessionStart = Date.now();
    sessionRunning = true;
    el.classList.remove('paused');
    icon.textContent = '⏸';
  }
}
function getSessionElapsed() {
  return sessionRunning ? sessionElapsed + (Date.now() - sessionStart) : sessionElapsed;
}
function tickTimers() {
  taskIds.forEach(tid => {
    const el = document.getElementById('timer-'+tid);
    const t  = timers[tid];
    if (!el) return;
    if (t.running || t.elapsed > 0) {
      el.querySelector('.t-val').textContent = formatTime(getTaskElapsed(tid));
    }
    // Mark done styling
    const allDone = [...document.getElementById(tid).querySelectorAll('input[type="checkbox"]')].every(b=>b.checked);
    if (allDone && !t.running) el.classList.add('done');
  });
  if (workshopStarted) {
    const valEl = document.getElementById('total-timer-val');
    if (valEl) valEl.textContent = formatTime(getSessionElapsed());
  }
  // Studio-header countdown + progress bar — presentation only, derived from
  // the existing session-elapsed clock; budgetMin is a new additive field on
  // the in-memory task-transfer object (not a PKG schema change). Suppressed
  // in read-only review mode — setReadOnly() already froze #ps-timer on the
  // fixed "Completed in …" label; this tick must not overwrite it.
  if (!psReadOnly && workshopStarted && currentTaskMeta && currentTaskMeta.budgetMin) {
    const budgetMs = currentTaskMeta.budgetMin * 60000;
    const elapsed = getSessionElapsed();
    const remain = Math.max(0, budgetMs - elapsed);
    const tEl = document.getElementById('ps-timer');
    if (tEl) tEl.textContent = formatTime(remain);
    const pEl = document.getElementById('ps-progress-fill');
    if (pEl) pEl.style.width = Math.min(100, Math.round((elapsed/budgetMs)*100)) + '%';
  }
}

// ════════════════════════════════════════
//  SELECTION
// ════════════════════════════════════════
function selectOnly(id) { clearSelection(); if(id){selectedIds.add(id);document.getElementById(id)?.classList.add('selected');} updateMergeBtn(); }
function clearSelection() { selectedIds.forEach(id=>document.getElementById(id)?.classList.remove('selected')); selectedIds.clear(); updateMergeBtn(); }
function duplicateSelectedPanels(){
  if (!selectedIds.size) { alert('Select one or more panels first, then click Duplicate.'); return; }
  snapshotForUndo();
  const ids=[...selectedIds];
  const newIds=[];
  ids.forEach(id=>{
    const orig=wsPanels.find(q=>q.id===id); if(!orig) return;
    const nid='wp_dup_'+Date.now()+'_'+Math.random().toString(36).slice(2,5);
    const np={...orig, id:nid, x:orig.x+14, y:orig.y+14};
    wsPanels.push(np);
    if (np.penData && np.penData.isMerged) renderMergedPanel(np); else renderPanel(np);
    newIds.push(nid);
  });
  updateEmptyState();
  clearSelection();
  newIds.forEach(id=>{ selectedIds.add(id); document.getElementById(id)?.classList.add('selected'); bringToTop(id); });
  updateMergeBtn();
}

// ── Rotate / Flip / Fill for the current selection (left icon toolbar) ──
function rotateSelectedPanels(deg){
  if (!selectedIds.size) { alert('Select one or more panels first, then click Rotate.'); return; }
  snapshotForUndo();
  let skippedMerged = 0;
  selectedIds.forEach(id=>{
    const p = wsPanels.find(q=>q.id===id); if(!p) return;
    if (p.penData && p.penData.isMerged) { skippedMerged++; return; } // merged shapes don't support rotation
    p.rot = ((p.rot||0) + deg) % 360;
    const el = document.getElementById(id), img = el && el.querySelector('.pimg');
    if (img) img.style.transform = `rotate(${p.rot}deg) scaleX(${p.flip?-1:1})`;
  });
  if (skippedMerged) alert(skippedMerged+' merged panel(s) skipped — rotation isn\'t supported for those.');
}
function flipSelectedPanels(){
  if (!selectedIds.size) { alert('Select one or more panels first, then click Flip.'); return; }
  snapshotForUndo();
  selectedIds.forEach(id=>{
    const p = wsPanels.find(q=>q.id===id); if(!p || (p.penData && p.penData.isMerged)) return;
    p.flip = !p.flip;
    const el = document.getElementById(id), img = el && el.querySelector('.pimg');
    if (img) img.style.transform = `rotate(${p.rot||0}deg) scaleX(${p.flip?-1:1})`;
  });
}
function fillSelectedPanels(){
  if (!selectedIds.size) { alert('Select one or more panels first, then choose a fill colour.'); return; }
  const ids=[...selectedIds];
  let inp = document.getElementById('bulk-fill-input');
  if (!inp) {
    inp = document.createElement('input');
    inp.type='color'; inp.id='bulk-fill-input'; inp.style.cssText='position:fixed;left:-999px;top:-999px;';
    document.body.appendChild(inp);
  }
  inp.oninput = () => { ids.forEach(id=>applyFillColor(id, inp.value)); };
  inp.click();
}

// ── Grid overlay toggle (right icon toolbar) — precision drawing/scaling ──
let gridOverlayOn = false;
function toggleGridOverlay(){
  gridOverlayOn = !gridOverlayOn;
  document.getElementById('grid-overlay')?.classList.toggle('visible', gridOverlayOn);
  document.getElementById('btn-grid')?.classList.toggle('on', gridOverlayOn);
}
let marginGuideOn = false;
function toggleMarginGuide(){
  marginGuideOn = !marginGuideOn;
  document.getElementById('margin-guide')?.classList.toggle('visible', marginGuideOn);
  document.getElementById('btn-margin')?.classList.toggle('on', marginGuideOn);
}

function updateMergeBtn(){
  const btn=document.getElementById('btn-merge');
  if(!btn) return;
  btn.disabled = selectedIds.size < 2;
  const tBtn=document.getElementById('btn-trace');
  if(tBtn) tBtn.disabled = selectedIds.size < 1;
  document.getElementById('workspace')?.classList.toggle('multi-select', selectedIds.size > 1);
}
function bringToTop(id) { zCounter++; const el=document.getElementById(id); if(el) el.style.zIndex=zCounter; }

// ════════════════════════════════════════
//  TOOLBAR HINT
// ════════════════════════════════════════
function updateToolbarHint() {
  const el=document.getElementById('toolbar-hint');
  if (penEditMode) el.innerHTML='✏️ <strong>Edit path:</strong> drag <strong>anchor</strong> = move node &nbsp;·&nbsp; drag <strong>circle handle</strong> = adjust curve &nbsp;·&nbsp; <strong>click anchor</strong> = toggle corner ↔ smooth &nbsp;·&nbsp; <kbd>↵ Enter</kbd> or <kbd>Esc</kbd> = finish editing';
  else if (penMode) el.innerHTML='✒ <strong>Pen:</strong> <strong>click</strong> = corner node &nbsp;·&nbsp; <strong>click+drag</strong> = curved node with handles &nbsp;·&nbsp; hover first node (turns green) + click = close path &nbsp;·&nbsp; drag on close = curve the closing segment &nbsp;·&nbsp; <kbd>↵ Enter</kbd> or double-click = finish open &nbsp;·&nbsp; <kbd>Esc</kbd> = cancel &nbsp;·&nbsp; <strong>double-click finished shape</strong> = edit nodes';
  else if (mapMode) el.innerHTML='🗺 <strong>Map:</strong> ① click panel → ② click garment spot · click mapped panel again to remove · <kbd>Esc</kbd> exit';
  else el.innerHTML='drag <kbd>◢</kbd> = scale &nbsp;·&nbsp; <kbd>⌘</kbd>+drag <kbd>◢</kbd> = rotate &nbsp;·&nbsp; <kbd>⌥</kbd>+drag = copy &nbsp;·&nbsp; <kbd>⌘</kbd>+click = multi-select &nbsp;·&nbsp; drag ruler = guide &nbsp;·&nbsp; <kbd>⌫</kbd> delete';
}

// ════════════════════════════════════════
//  ADD PANEL (placed at current scroll position)
// ════════════════════════════════════════
// Convert an SVG-sourced panel's outline into pen-editable nodes (anchor
// points + bezier handles), mapped into its CURRENT absolute workspace
// position/rotation/flip/scale. Returns null if the source isn't real SVG
// (e.g. a photo/scan) or has no extractable path/polygon/rect shape.
// ── SVG transform-attribute support ──
// Illustrator's SVG export commonly wraps a path in one or more <g
// transform="..."> ancestor groups (translate/rotate/scale from the
// artboard layout). Reading a path's raw d/points without accounting for
// this produces geometry that's mispositioned, wrongly scaled, or rotated.
function mulSvgMatrix(m1,m2){
  return [
    m1[0]*m2[0]+m1[2]*m2[1], m1[1]*m2[0]+m1[3]*m2[1],
    m1[0]*m2[2]+m1[2]*m2[3], m1[1]*m2[2]+m1[3]*m2[3],
    m1[0]*m2[4]+m1[2]*m2[5]+m1[4], m1[1]*m2[4]+m1[3]*m2[5]+m1[5]
  ];
}
function parseSvgTransformAttr(str){
  let m = [1,0,0,1,0,0];
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match;
  while ((match = re.exec(str||''))) {
    const fn = match[1];
    const args = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (fn === 'rotate' && args.length >= 3) {
      const a=(args[0]||0)*Math.PI/180, cos=Math.cos(a), sin=Math.sin(a), cx=args[1], cy=args[2];
      m = mulSvgMatrix(m, [1,0,0,1,cx,cy]);
      m = mulSvgMatrix(m, [cos,sin,-sin,cos,0,0]);
      m = mulSvgMatrix(m, [1,0,0,1,-cx,-cy]);
      continue;
    }
    let mm;
    if (fn === 'matrix') mm = args;
    else if (fn === 'translate') mm = [1,0,0,1, args[0]||0, args[1]||0];
    else if (fn === 'scale') { const sx=args[0]; const sy=args.length>1?args[1]:sx; mm=[sx,0,0,sy,0,0]; }
    else if (fn === 'rotate') { const a=(args[0]||0)*Math.PI/180; mm=[Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0]; }
    else if (fn === 'skewX') { mm=[1,0,Math.tan((args[0]||0)*Math.PI/180),1,0,0]; }
    else if (fn === 'skewY') { mm=[1,Math.tan((args[0]||0)*Math.PI/180),0,1,0,0]; }
    else continue;
    m = mulSvgMatrix(m, mm);
  }
  return m;
}
function getSvgElementTransformChain(el, root){
  let m = [1,0,0,1,0,0];
  const chain = [];
  let node = el;
  while (node && node !== root) {
    if (node.getAttribute) { const t = node.getAttribute('transform'); if (t) chain.unshift(t); }
    node = node.parentNode;
  }
  chain.forEach(t => { m = mulSvgMatrix(m, parseSvgTransformAttr(t)); });
  return m;
}
function applySvgMatrix(m, x, y){ return { x: m[0]*x+m[2]*y+m[4], y: m[1]*x+m[3]*y+m[5] }; }

async function svgPanelToPenNodes(p) {
  const svgText = await fetchSvgTextForTrace(p.src);
  if (!svgText) return null;
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) return null;

  const vbAttr = (svgEl.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
  const vb = { x:vbAttr[0]||0, y:vbAttr[1]||0, w:vbAttr[2]||parseFloat(svgEl.getAttribute('width')||'100'), h:vbAttr[3]||parseFloat(svgEl.getAttribute('height')||'100') };
  const el = svgEl.querySelector('path,polygon,polyline,rect');
  if (!el) return null;

  let localNodes = [];
  let closed = false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'path') {
    let cx=0,cy=0,sx=0,sy=0;
    const cmds = (el.getAttribute('d')||'').trim().match(/[MLHVCZmlhvcz][^MLHVCZmlhvcz]*/g)||[];
    for (const cmd of cmds) {
      const type=cmd[0], T=type.toUpperCase(), rel=(type!==T);
      const nums = cmd.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number);
      if (T==='M') {
        cx = rel? cx+nums[0] : nums[0]; cy = rel? cy+nums[1] : nums[1];
        sx=cx; sy=cy;
        localNodes.push({x:cx,y:cy,smooth:false,handleIn:null,handleOut:null});
        for(let i=2;i<nums.length;i+=2){ cx = rel? cx+nums[i] : nums[i]; cy = rel? cy+nums[i+1] : nums[i+1]; localNodes.push({x:cx,y:cy,smooth:false,handleIn:null,handleOut:null}); }
      } else if (T==='L') {
        for(let i=0;i<nums.length;i+=2){ cx = rel? cx+nums[i] : nums[i]; cy = rel? cy+nums[i+1] : nums[i+1]; localNodes.push({x:cx,y:cy,smooth:false,handleIn:null,handleOut:null}); }
      } else if (T==='H') { for(const n of nums){ cx = rel?cx+n:n; localNodes.push({x:cx,y:cy,smooth:false,handleIn:null,handleOut:null}); } }
      else if (T==='V') { for(const n of nums){ cy = rel?cy+n:n; localNodes.push({x:cx,y:cy,smooth:false,handleIn:null,handleOut:null}); } }
      else if (T==='C') {
        for(let i=0;i<nums.length;i+=6){
          const x1=rel?cx+nums[i]:nums[i], y1=rel?cy+nums[i+1]:nums[i+1];
          const x2=rel?cx+nums[i+2]:nums[i+2], y2=rel?cy+nums[i+3]:nums[i+3];
          const ex=rel?cx+nums[i+4]:nums[i+4], ey=rel?cy+nums[i+5]:nums[i+5];
          const prev = localNodes[localNodes.length-1];
          if (prev) prev.handleOut = {x:x1,y:y1};
          localNodes.push({x:ex,y:ey,smooth:true,handleIn:{x:x2,y:y2},handleOut:null});
          cx=ex; cy=ey;
        }
      } else if (T==='Z') { closed = true; cx=sx; cy=sy; }
    }
  } else if (tag==='polygon'||tag==='polyline') {
    const nums=(el.getAttribute('points')||'').trim().split(/[\s,]+/).filter(Boolean).map(Number);
    for(let i=0;i<nums.length-1;i+=2) localNodes.push({x:nums[i],y:nums[i+1],smooth:false,handleIn:null,handleOut:null});
    closed = tag==='polygon';
  } else if (tag==='rect') {
    const rx=parseFloat(el.getAttribute('x')||'0'), ry=parseFloat(el.getAttribute('y')||'0');
    const rw=parseFloat(el.getAttribute('width')||'0'), rh=parseFloat(el.getAttribute('height')||'0');
    localNodes = [{x:rx,y:ry},{x:rx+rw,y:ry},{x:rx+rw,y:ry+rh},{x:rx,y:ry+rh}].map(pt=>({...pt,smooth:false,handleIn:null,handleOut:null}));
    closed = true;
  }
  if (localNodes.length < 2) return null;

  // Fold in any transform="..." on the element itself or its ancestor <g>
  // groups (very common in Illustrator's SVG export) before anything else.
  const elMatrix = getSvgElementTransformChain(el, svgEl);
  localNodes = localNodes.map(n => ({
    ...n,
    ...applySvgMatrix(elMatrix, n.x, n.y),
    handleIn:  n.handleIn  ? applySvgMatrix(elMatrix, n.handleIn.x, n.handleIn.y)   : null,
    handleOut: n.handleOut ? applySvgMatrix(elMatrix, n.handleOut.x, n.handleOut.y) : null,
  }));

  const domEl = document.getElementById(p.id);
  const imgEl = domEl && domEl.querySelector('.pimg');
  const naturalW = imgEl?imgEl.naturalWidth:0, naturalH = imgEl?imgEl.naturalHeight:0;
  const pw = Math.round(100*p.scale);
  const ph = naturalW ? pw*(naturalH/naturalW) : pw;
  const sx2=pw/vb.w, sy2=ph/vb.h;
  const cosR=Math.cos((p.rot||0)*Math.PI/180), sinR=Math.sin((p.rot||0)*Math.PI/180);
  const flipX=p.flip?-1:1;
  const cxWS=p.x+pw/2, cyWS=p.y+ph/2;
  function toWS(lx0,ly0){
    const lx=(lx0-vb.x)*sx2-pw/2, ly=(ly0-vb.y)*sy2-ph/2;
    const fx=lx*flipX, fy=ly;
    const rx=fx*cosR-fy*sinR, ry=fx*sinR+fy*cosR;
    return {x:cxWS+rx, y:cyWS+ry};
  }
  const nodes = localNodes.map(n=>({
    x: toWS(n.x,n.y).x, y: toWS(n.x,n.y).y, smooth:n.smooth,
    handleIn:  n.handleIn  ? toWS(n.handleIn.x,n.handleIn.y)  : null,
    handleOut: n.handleOut ? toWS(n.handleOut.x,n.handleOut.y) : null,
  }));
  return { nodes, closed };
}

function addPanelToWorkspace(src) {
  if (psReadOnly) return;
  const vp=document.getElementById('ws-viewport');
  const offset=wsPanels.length;
  const pid='wp_'+Date.now()+'_'+Math.random().toString(36).slice(2,5);
  const np={ id:pid, src, x:vp.scrollLeft+20+(offset%6)*22, y:vp.scrollTop+20+Math.floor(offset/6)*22, rot:0, flip:false, scale:1 };
  wsPanels.push(np); renderPanel(np); updateEmptyState(); selectOnly(pid); bringToTop(pid);
}

// ════════════════════════════════════════
//  RENDER PANEL
// ════════════════════════════════════════
// ════════════════════════════════════════
//  PIXEL-ACCURATE HIT TEST FOR PANEL SELECTION
//  A panel's clickable box is its axis-aligned bounding rect (CSS layout
//  doesn't shrink to the visible shape), so angular/rotated panels have
//  "dead" transparent corners inside that rect that would otherwise block
//  clicks meant for whatever sits underneath. This samples the actual
//  rendered pixel alpha at the click point so transparent corners pass
//  the click through instead of capturing it.
// ════════════════════════════════════════
const _panelAlphaCache = new Map(); // src -> {w,h,data} | 'opaque' (fallback)

// Quick check: does at least one OTHER panel's bounding box also cover this
// point? Only in that case is it worth doing the more expensive (and, near
// antialiased edges, occasionally fallible) pixel-alpha test — for the
// common case of a shape with nothing behind it, skip straight to "hit" so
// dragging stays 100% reliable.
function hasOverlapAt(panelId, clientX, clientY) {
  const wsRect = document.getElementById('workspace').getBoundingClientRect();
  const wx = clientX - wsRect.left, wy = clientY - wsRect.top;
  for (const q of wsPanels) {
    if (q.id === panelId) continue;
    const qEl = document.getElementById(q.id);
    if (!qEl) continue;
    const qw = qEl.offsetWidth, qh = qEl.offsetHeight;
    if (wx >= q.x && wx <= q.x + qw && wy >= q.y && wy <= q.y + qh) return true;
  }
  return false;
}

function isPointOpaqueOnPanel(p, clientX, clientY) {
  const wsRect = document.getElementById('workspace').getBoundingClientRect();
  const wx = clientX - wsRect.left, wy = clientY - wsRect.top;

  // Merged/traced panels render as a native SVG path (no <img> to sample) —
  // test against the stored polygon directly instead.
  if (p.penData && p.penData.isMerged && p.penData.nodes && p.penData.nodes.length >= 3) {
    const pts = p.penData.nodes;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      const intersect = ((yi > wy) !== (yj > wy)) && (wx < (xj - xi) * (wy - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  const el = document.getElementById(p.id);
  if (!el) return true;
  const imgEl = el.querySelector('.pimg');
  if (!imgEl || !imgEl.naturalWidth) return true; // can't test yet — fail safe as solid

  const w = Math.round(100 * p.scale);
  const h = w * (imgEl.naturalHeight / imgEl.naturalWidth);
  const cx = p.x + w / 2, cy = p.y + h / 2;
  let lx = wx - cx, ly = wy - cy;
  const rad = -((p.rot || 0) * Math.PI / 180);
  const cos = Math.cos(rad), sin = Math.sin(rad);
  let rx = lx * cos - ly * sin, ry = lx * sin + ly * cos;
  if (p.flip) rx = -rx;
  const imgX = Math.round((rx + w / 2) / w * imgEl.naturalWidth);
  const imgY = Math.round((ry + h / 2) / h * imgEl.naturalHeight);
  if (imgX < 0 || imgY < 0 || imgX >= imgEl.naturalWidth || imgY >= imgEl.naturalHeight) return false;

  const key = imgEl.src;
  let entry = _panelAlphaCache.get(key);
  if (!entry) {
    try {
      const cvs = document.createElement('canvas');
      cvs.width = imgEl.naturalWidth; cvs.height = imgEl.naturalHeight;
      const ctx = cvs.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(imgEl, 0, 0);
      entry = { w: cvs.width, h: cvs.height, data: ctx.getImageData(0, 0, cvs.width, cvs.height).data };
    } catch (err) {
      entry = 'opaque'; // CORS-tainted or decode error — fall back to treating as solid
    }
    _panelAlphaCache.set(key, entry);
  }
  if (entry === 'opaque') return true;
  // Sample a small forgiving neighborhood (a couple of CSS-pixels' worth, in
  // image-space) around the exact point, rather than a single exact pixel.
  // A single-pixel test is fragile right at an antialiased shape edge —
  // exactly where people naturally click to grab a shape — and a false
  // "miss" there means the click falls through to empty canvas instead of
  // grabbing the shape. Treat it as a hit if ANY nearby pixel is opaque.
  const tol = Math.max(2, Math.round((imgEl.naturalWidth / w) * 2));
  const step = Math.max(1, Math.floor(tol / 2));
  for (let dy = -tol; dy <= tol; dy += step) {
    for (let dx = -tol; dx <= tol; dx += step) {
      const sx = imgX + dx, sy = imgY + dy;
      if (sx < 0 || sy < 0 || sx >= entry.w || sy >= entry.h) continue;
      if (entry.data[(sy * entry.w + sx) * 4 + 3] > 12) return true;
    }
  }
  return false;
}

// If a click lands on this panel's transparent area, pass it through to
// whatever panel (if any) sits directly underneath at that point.
function passClickToPanelBelow(div, e) {
  const prevPE = div.style.pointerEvents;
  div.style.pointerEvents = 'none';
  const under = document.elementFromPoint(e.clientX, e.clientY);
  div.style.pointerEvents = prevPE;
  const underPanelEl = under && under.closest && under.closest('.ws-panel-el');
  if (underPanelEl && underPanelEl !== div) {
    e.stopPropagation();
    underPanelEl.dispatchEvent(new MouseEvent(e.type, {
      bubbles: true, cancelable: true, view: window,
      clientX: e.clientX, clientY: e.clientY, button: e.button,
      shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey
    }));
    return true;
  }
  return false; // nothing underneath — let the event bubble naturally (e.g. to workspace)
}

function renderPanel(p) {
  const ws=document.getElementById('workspace');
  const div=document.createElement('div');
  div.className='ws-panel-el'; div.id=p.id;
  div.style.left=p.x+'px'; div.style.top=p.y+'px'; div.style.zIndex=++zCounter;
  const w=Math.round(100*p.scale);
  div.innerHTML=`
    <div class="panel-map-badge" id="badge-${p.id}"></div>
    <div class="pimg-wrap">
      <img class="pimg" src="${p.src}" style="width:${w}px;transform:rotate(${p.rot}deg) scaleX(${p.flip?-1:1})" draggable="false">
      <div class="resize-handle" title="Drag=scale · ⌘+Drag=rotate"></div>
    </div>
    <div class="pctrl">
      <button onclick="flipWS('${p.id}')">⇄ Flip</button>
      <button onclick="toggleColorPopover('${p.id}',this)" title="Fill colour" style="display:flex;align-items:center;gap:3px"><span class="fill-swatch"></span></button>
      <button class="rm-btn" onclick="rmWS('${p.id}')">×</button>
    </div>`;

  // ── Mousedown: drag or Option+drag=duplicate ──
  div.addEventListener('mousedown', e => {
    if (e.target.closest('.resize-handle')||e.target.tagName==='BUTTON') return;
    if (!mapMode && hasOverlapAt(p.id, e.clientX, e.clientY) && !isPointOpaqueOnPanel(p, e.clientX, e.clientY)) { passClickToPanelBelow(div, e); return; }
    e.preventDefault(); e.stopPropagation();
    if (mapMode) { mapPanel(p.id); return; }

    if (e.altKey) {
      // Option+drag → duplicate
      const orig=wsPanels.find(q=>q.id===p.id); if(!orig) return;
      snapshotForUndo();
      const nid='wp_dup_'+Date.now()+'_'+Math.random().toString(36).slice(2,5);
      const np={...orig, id:nid, x:orig.x+14, y:orig.y+14};
      wsPanels.push(np); renderPanel(np); updateEmptyState();
      selectOnly(nid); bringToTop(nid);
      drag={ active:true, group:true, startPositions:[{id:nid,px:np.x,py:np.y}], sx:e.clientX, sy:e.clientY };
      document.getElementById(nid)?.classList.add('dragging');
      return;
    }

    bringToTop(p.id);
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      if (selectedIds.has(p.id)){selectedIds.delete(p.id);div.classList.remove('selected');}
      else                       {selectedIds.add(p.id);   div.classList.add('selected');}
      updateMergeBtn();
    } else if (!selectedIds.has(p.id)) { selectOnly(p.id); }
    snapshotForUndo();
    const startPositions=[...selectedIds].map(id=>{ const q=wsPanels.find(q=>q.id===id); return q?{id,px:q.x,py:q.y}:null; }).filter(Boolean);
    drag={ active:true, group:true, startPositions, sx:e.clientX, sy:e.clientY };
    div.classList.add('dragging');
  });

  div.addEventListener('click', e => {
    if (e.target.tagName==='BUTTON'||mapMode) return;
    if (hasOverlapAt(p.id, e.clientX, e.clientY) && !isPointOpaqueOnPanel(p, e.clientX, e.clientY)) return;
    e.stopPropagation(); if(!e.shiftKey) selectOnly(p.id); bringToTop(p.id);
  });

  // ── Double-click panel → enter path edit mode (auto-converting from its
  // SVG source into editable nodes on first use, if it isn't pen data yet) ──
  div.addEventListener('dblclick', e => {
    if (e.target.tagName==='BUTTON'||mapMode) return;
    if (hasOverlapAt(p.id, e.clientX, e.clientY) && !isPointOpaqueOnPanel(p, e.clientX, e.clientY)) return;
    e.stopPropagation();
    const q = wsPanels.find(q=>q.id===p.id);
    if (!q) return;
    if (q.penData) { enterPenEditMode(p.id); return; }
    svgPanelToPenNodes(q).then(result => {
      if (!result) {
        alert("This panel doesn't have extractable outline data to edit (it's likely a photo/scan rather than a vector shape). Use Trace to extract its outline first — then it can be edited with the pen tool.");
        return;
      }
      snapshotForUndo();
      q.penData = { nodes: result.nodes, closed: result.closed };
      enterPenEditMode(p.id);
    });
  });

  // ── Resize handle: scale or Cmd+drag=rotate around center ──
  div.querySelector('.resize-handle').addEventListener('mousedown', e => {
    e.stopPropagation(); e.preventDefault();
    const q=wsPanels.find(q=>q.id===p.id); if(!q) return;
    const el=document.getElementById(p.id); if(!el) return;
    snapshotForUndo();

    if (e.metaKey||e.ctrlKey) {
      const elRect=el.getBoundingClientRect();
      const wsRect=document.getElementById('workspace').getBoundingClientRect();
      const ws_cx=(elRect.left-wsRect.left)+elRect.width/2;
      const ws_cy=(elRect.top-wsRect.top)+elRect.height/2;
      const mwx=e.clientX-wsRect.left, mwy=e.clientY-wsRect.top;
      const initAngle=Math.atan2(mwy-ws_cy,mwx-ws_cx)*180/Math.PI;
      resizeDrag={ active:true, id:p.id, mode:'rotate', initRot:q.rot, initAngle, ws_cx, ws_cy };
      document.body.style.cursor='crosshair';
    } else {
      // Group scale: when multiple shapes are selected, scale all together
      const isGroup = selectedIds.size > 1 && selectedIds.has(p.id);
      if (isGroup) {
        const items = [...selectedIds].map(id => {
          const pq = wsPanels.find(pq=>pq.id===id);
          return pq ? { id, initScale:pq.scale, initX:pq.x, initY:pq.y } : null;
        }).filter(Boolean);
        const cx = items.reduce((s,it)=>s+it.initX,0) / items.length;
        const cy = items.reduce((s,it)=>s+it.initY,0) / items.length;
        resizeDrag = { active:true, id:p.id, mode:'scale', sx:e.clientX, sy:e.clientY,
                       initScale:q.scale, groupScale:true, groupItems:items, groupCenter:{x:cx,y:cy} };
      } else {
        resizeDrag = { active:true, id:p.id, mode:'scale', sx:e.clientX, sy:e.clientY,
                       initScale:q.scale, groupScale:false };
      }
      document.body.style.cursor='se-resize';
    }
  });

  // Touch
  div.addEventListener('touchstart', e=>{
    if (e.target.tagName==='BUTTON') return;
    if (mapMode){mapPanel(p.id);return;}
    e.preventDefault(); bringToTop(p.id); selectOnly(p.id);
    const t=e.touches[0];
    drag={active:true,group:false,id:p.id,sx:t.clientX,sy:t.clientY,px:p.x,py:p.y};
  },{passive:false});

  // Invalidate SVG cache when panel is removed/moved
  ws.appendChild(div);

  // Re-apply fill colour if already stored
  if (p.fillColor && p.fillColor !== 'none') {
    const imgEl = div.querySelector('.pimg');
    if (imgEl && p.src && p.src.startsWith('data:image/svg+xml')) {
      // SVG panel: re-encode with fill
      if (!p._origSrc) p._origSrc = p.src;
      imgEl.src = svgWithFill(p._origSrc, p.fillColor);
    } else {
      // Raster panel: overlay
      const wrap = div.querySelector('.pimg-wrap');
      if (wrap) {
        wrap.style.position = 'relative';
        const ov = document.createElement('div');
        ov.className = 'fill-overlay';
        ov.style.cssText = 'position:absolute;inset:0;pointer-events:none;mix-blend-mode:multiply;opacity:0.45;border-radius:2px;';
        ov.style.background = p.fillColor;
        wrap.appendChild(ov);
      }
    }
  }
  const sw = div.querySelector('.fill-swatch');
  if (sw) updateSwatchStyle(sw, p.fillColor || 'none');
}

function updateEmptyState() {
  document.getElementById('ws-empty').style.display=wsPanels.length===0?'flex':'none';
}

// ════════════════════════════════════════
//  WORKSPACE MOUSEDOWN
// ════════════════════════════════════════
function onWorkspaceMouseDown(e) {
  if (psReadOnly) return;
  if (e.target.closest('#mannequin-win')) return;
  if (penMode) { onPenMouseDown(e); return; }
  if (e.target.closest('.ws-panel-el')) return;
  if (e.target.closest('.guide')) return;
  if (e.target.closest('#garment-overlay')&&mapMode) return;
  e.preventDefault(); clearSelection();
  const wsRect=document.getElementById('workspace').getBoundingClientRect();
  const sx=e.clientX-wsRect.left, sy=e.clientY-wsRect.top;
  rubberBand={ active:true, sx, sy, wsRect };
  const r=document.getElementById('sel-rect');
  r.style.cssText=`display:block;left:${sx}px;top:${sy}px;width:0;height:0`;
}

// ════════════════════════════════════════
//  MOUSE MOVE / UP
// ════════════════════════════════════════
function onMouseMove(e) {
  if (mqRotDrag.active) { const dx=e.clientX-mqRotDrag.sx; mqRotDrag.sx=e.clientX; if(mqMesh) mqMesh.rotation.y+=dx*0.012; return; }
  if (mqWinDrag.active) {
    const win=document.getElementById('mannequin-win');
    win.style.left=(mqWinDrag.ix+e.clientX-mqWinDrag.sx)+'px';
    win.style.top=(mqWinDrag.iy+e.clientY-mqWinDrag.sy)+'px';
    return;
  }
  // Guide drag
  if (guideDrag.active) {
    const g=guides.find(g=>g.id===guideDrag.id); if(!g){guideDrag.active=false;return;}
    const wsRect=document.getElementById('workspace').getBoundingClientRect();
    const el=document.querySelector(`[data-guide="${guideDrag.id}"]`);
    if (g.type==='h') {
      g.pos=Math.max(0,Math.min(WS_H-2,e.clientY-wsRect.top));
      if (el){el.style.top=g.pos+'px';el.querySelector('.guide-label').textContent=`y:${Math.round(g.pos)}`;}
    } else {
      g.pos=Math.max(0,Math.min(WS_W-2,e.clientX-wsRect.left));
      if (el){el.style.left=g.pos+'px';el.querySelector('.guide-label').textContent=`x:${Math.round(g.pos)}`;}
    }
    return;
  }
  // Resize / rotate
  if (resizeDrag.active) {
    const q=wsPanels.find(q=>q.id===resizeDrag.id); if(!q) return;
    const el=document.getElementById(resizeDrag.id); if(!el) return;
    const img=el.querySelector('.pimg');
    if (resizeDrag.mode==='rotate') {
      const wsRect=document.getElementById('workspace').getBoundingClientRect();
      const mwx=e.clientX-wsRect.left, mwy=e.clientY-wsRect.top;
      const newAngle=Math.atan2(mwy-resizeDrag.ws_cy,mwx-resizeDrag.ws_cx)*180/Math.PI;
      q.rot=((resizeDrag.initRot+(newAngle-resizeDrag.initAngle))%360+360)%360;
      if (img) img.style.transform=`rotate(${q.rot}deg) scaleX(${q.flip?-1:1})`;
    } else {
      const dx=e.clientX-resizeDrag.sx, dy=e.clientY-resizeDrag.sy;
      const newScale = Math.max(0.2, Math.min(6, resizeDrag.initScale+(dx+dy)/200));
      if (resizeDrag.groupScale && resizeDrag.groupItems) {
        // Scale all selected shapes proportionally, positions relative to group centroid
        const f = newScale / resizeDrag.initScale;
        const gc = resizeDrag.groupCenter;
        resizeDrag.groupItems.forEach(({id, initScale, initX, initY}) => {
          const pq=wsPanels.find(pq=>pq.id===id); if(!pq) return;
          const pel=document.getElementById(id); if(!pel) return;
          pq.scale = Math.max(0.2, Math.min(6, initScale * f));
          pq.x = gc.x + (initX - gc.x) * f;
          pq.y = gc.y + (initY - gc.y) * f;
          const pimg=pel.querySelector('.pimg');
          if (pimg) pimg.style.width=Math.round(100*pq.scale)+'px';
          pel.style.left=pq.x+'px'; pel.style.top=pq.y+'px';
        });
      } else {
        q.scale = newScale;
        if (img) img.style.width=Math.round(100*q.scale)+'px';
      }
    }
    return;
  }
  // Pen
  if (penMode) { onPenMouseMove(e); return; }
  // Rubber-band
  if (rubberBand.active) {
    const {sx,sy,wsRect}=rubberBand;
    const cx=e.clientX-wsRect.left,cy=e.clientY-wsRect.top;
    const x=Math.min(sx,cx),y=Math.min(sy,cy),w=Math.abs(cx-sx),h=Math.abs(cy-sy);
    const r=document.getElementById('sel-rect');
    r.style.left=x+'px';r.style.top=y+'px';r.style.width=w+'px';r.style.height=h+'px';
    rubberBand.ex=cx;rubberBand.ey=cy;return;
  }
  // Panel/group drag — free movement anywhere within the workspace
  if (drag.active) {
    if (drag.group) {
      const dx=e.clientX-drag.sx,dy=e.clientY-drag.sy;
      drag.startPositions.forEach(({id,px,py})=>{
        const q=wsPanels.find(q=>q.id===id); if(!q) return;
        q.x=px+dx; q.y=py+dy;
        const el=document.getElementById(id);
        if (el){el.style.left=q.x+'px';el.style.top=q.y+'px';}
      });
    } else if (drag.id) {
      const q=wsPanels.find(q=>q.id===drag.id); if(!q) return;
      q.x=drag.px+(e.clientX-drag.sx); q.y=drag.py+(e.clientY-drag.sy);
      const el=document.getElementById(drag.id);
      if (el){el.style.left=q.x+'px';el.style.top=q.y+'px';}
    }
  }
}

function onMouseUp(e) {
  if (mqRotDrag.active)  { mqRotDrag.active=false; return; }
  if (mqWinDrag.active)  { mqWinDrag.active=false; return; }
  if (guideDrag.active)  { guideDrag.active=false; return; }
  if (resizeDrag.active) { resizeDrag.active=false; document.body.style.cursor=''; }
  if (penMode) { onPenMouseUp(e); }
  if (rubberBand.active) {
    rubberBand.active=false;
    document.getElementById('sel-rect').style.display='none';
    const {sx,sy}=rubberBand;
    const ex=rubberBand.ex??sx, ey=rubberBand.ey??sy;
    const x1=Math.min(sx,ex),y1=Math.min(sy,ey),x2=Math.max(sx,ex),y2=Math.max(sy,ey);
    if (x2-x1>4||y2-y1>4) {
      wsPanels.forEach(q=>{
        if(q.x>=x1&&q.x<=x2&&q.y>=y1&&q.y<=y2){selectedIds.add(q.id);document.getElementById(q.id)?.classList.add('selected');}
      });
    }
  }
  if (drag.active) {
    drag.startPositions?.forEach(({id})=>document.getElementById(id)?.classList.remove('dragging'));
    drag.active=false;
  }
}

// ════════════════════════════════════════
//  TOUCH
// ════════════════════════════════════════
document.addEventListener('touchmove',e=>{
  if(!drag.active||!drag.id) return; e.preventDefault();
  const t=e.touches[0],q=wsPanels.find(q=>q.id===drag.id); if(!q) return;
  q.x=drag.px+(t.clientX-drag.sx); q.y=drag.py+(t.clientY-drag.sy);
  const el=document.getElementById(drag.id);
  if(el){el.style.left=q.x+'px';el.style.top=q.y+'px';}
},{passive:false});
document.addEventListener('touchend',()=>{drag.active=false;});

// ════════════════════════════════════════
//  PRINT
// ════════════════════════════════════════
const PRINT_MARGIN_MM = 10; // 10mm margin on each side
// Panels scale from workspace px → usable print area mm (portrait: 210×297mm)
// Usable area = (210 - 2×10) × (297 - 2×10) = 190 × 277mm.
// IMPORTANT: the workspace's aspect ratio (794/1123 ≈ 0.707) is not exactly
// the same as the usable area's aspect ratio (190/277 ≈ 0.686) — scaling from
// one dimension alone would make printed content taller/wider than the page
// itself, which is enough for some print engines to spill onto a second,
// blank page. Use the smaller of the two ratios so content always fits.
const PRINT_SCALE = Math.min((210 - 2 * PRINT_MARGIN_MM) / WS_W, (297 - 2 * PRINT_MARGIN_MM) / WS_H);

function printWorkspace() {
  if (!wsPanels.length) { alert('No panels on the workspace to print.'); return; }

  const layer = document.getElementById('print-layer');
  layer.innerHTML = '';

  // Extra centering offset: whichever dimension isn't the binding constraint
  // on PRINT_SCALE will have leftover space — split it evenly on both sides.
  const printableW = 210 - 2*PRINT_MARGIN_MM, printableH = 297 - 2*PRINT_MARGIN_MM;
  const centerOffX = Math.max(0, (printableW - WS_W*PRINT_SCALE) / 2);
  const centerOffY = Math.max(0, (printableH - WS_H*PRINT_SCALE) / 2);

  wsPanels.forEach(p => {
    const cx = Math.max(0, p.x);
    const cy = Math.max(0, p.y);
    const leftMm  = (cx * PRINT_SCALE + PRINT_MARGIN_MM + centerOffX).toFixed(3);
    const topMm   = (cy * PRINT_SCALE + PRINT_MARGIN_MM + centerOffY).toFixed(3);

    // ── Merged / traced panel — render as inline SVG ──
    if (p.penData && p._mergedD && p._bbox) {
      const bb = p._bbox;
      const wMm = (bb.w * PRINT_SCALE).toFixed(3);
      const hMm = (bb.h * PRINT_SCALE).toFixed(3);
      const fillCol = (p.fillColor && p.fillColor !== 'none') ? p.fillColor : '#f0f0eb';

      // Translate path to local coords (origin at bbox top-left)
      const ld = p._mergedD.replace(/(M|L)\s*([-\d.]+),([-\d.]+)/g,
        (_, cmd, x, y) => cmd + (parseFloat(x) - bb.x).toFixed(2) + ',' + (parseFloat(y) - bb.y).toFixed(2));

      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svgEl.setAttribute('viewBox', `0 0 ${bb.w.toFixed(2)} ${bb.h.toFixed(2)}`);
      svgEl.className = 'print-panel';
      svgEl.style.cssText = [
        `left:${leftMm}mm`, `top:${topMm}mm`,
        `width:${wMm}mm`, `height:${hMm}mm`,
        `transform:rotate(${p.rot||0}deg) scaleX(${p.flip?-1:1})`,
        `transform-origin:center center`,
      ].join(';');
      svgEl.innerHTML = `<path d="${ld}" fill="${fillCol}" fill-rule="evenodd" stroke="#3a3a3a" stroke-width="1.5" stroke-linejoin="round"/>`;
      layer.appendChild(svgEl);
      return;
    }

    // ── Regular image panel ──
    const img = document.createElement('img');
    img.className = 'print-panel';
    img.src = p.src;
    img.draggable = false;
    const widthMm = (100 * p.scale * PRINT_SCALE).toFixed(3);
    img.style.cssText = [
      `left:${leftMm}mm`, `top:${topMm}mm`,
      `width:${widthMm}mm`,
      `transform:rotate(${p.rot}deg) scaleX(${p.flip ? -1 : 1})`,
      `transform-origin:center center`,
    ].join(';');
    layer.appendChild(img);
  });

  window.print();
}

// ════════════════════════════════════════
//  WORKSPACE CONTROLS
// ════════════════════════════════════════
function rotWS(id,deg) {
  const p=wsPanels.find(p=>p.id===id); if(!p) return;
  p.rot=((p.rot+deg)+360)%360;
  document.querySelector(`#${id} .pimg`).style.transform=`rotate(${p.rot}deg) scaleX(${p.flip?-1:1})`;
}
function flipWS(id) {
  const p=wsPanels.find(p=>p.id===id); if(!p) return;
  snapshotForUndo();
  p.flip=!p.flip;
  document.querySelector(`#${id} .pimg`).style.transform=`rotate(${p.rot}deg) scaleX(${p.flip?-1:1})`;
}
function rmWS(id) {
  snapshotForUndo();
  if (panelMappings[id]!==undefined) {
    const num=panelMappings[id];
    garmentPinEls[num]?.remove(); delete garmentPinEls[num]; delete panelMappings[id];
  }
  wsPanels=wsPanels.filter(p=>p.id!==id);
  document.getElementById(id)?.remove();
  selectedIds.delete(id); updateEmptyState();
}
function clearWorkspace() {
  if (wsPanels.length) snapshotForUndo();
  wsPanels=[]; panelMappings={}; mapCounter=1; pendingMapNum=null;
  Object.values(garmentPinEls).forEach(el=>el?.remove()); garmentPinEls={};
  document.querySelectorAll('.ws-panel-el').forEach(el=>el.remove());
  selectedIds.clear();
  updateEmptyState(); if(mapMode) exitMapMode(); if(penMode) clearPenState();
}


// ════════════════════════════════════════
//  MERGE PANELS  (Boolean Union with hole preservation)
// ════════════════════════════════════════
// Approach:
//  1. For each selected panel, draw it onto an offscreen canvas with a SOLID
//     opaque fill (not just the stroke) so the interior is fully filled.
//     This is the key fix — SVG panels are stroke-only with transparent bg,
//     so previous approach (flood-fill from exterior) failed because transparent
//     interior was indistinguishable from exterior.
//  2. OR all panel masks → single binary bitmap
//  3. Marching squares → closed contours
//  4. Classify outer boundary vs holes by signed area (winding)
//  5. RDP simplification
//  6. Output as a new pen-drawn panel (draggable, exports to SVG/PDF)

async function mergeSelectedPanels() {
  const ids = [...selectedIds];
  if (ids.length < 2) return;
  snapshotForUndo();

  const btn = document.getElementById('btn-merge');
  const prevText = btn.textContent;
  btn.textContent = 'Merging\u2026'; btn.disabled = true;

  try {
    // ── Collect panel info ───────────────────────────────────────────────
    const items = [];
    for (const id of ids) {
      const p = wsPanels.find(q => q.id === id);
      if (!p) continue;
      const imgEl = document.getElementById(id)?.querySelector('.pimg');
      if (!imgEl) continue;
      const pw = Math.round(100 * p.scale);
      const ph = Math.round(pw * (imgEl.naturalHeight / imgEl.naturalWidth));
      items.push({ p, pw, ph, src: p.src });
    }
    if (items.length < 2) { btn.textContent = prevText; btn.disabled = false; return; }

    // ── Compute bounding box ─────────────────────────────────────────────
    // Use circumscribed circle radius to handle any rotation
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const { p, pw, ph } of items) {
      const r = Math.ceil(Math.sqrt(pw * pw + ph * ph) / 2) + 4;
      const cx = p.x + pw / 2, cy = p.y + ph / 2;
      minX = Math.min(minX, cx - r);
      minY = Math.min(minY, cy - r);
      maxX = Math.max(maxX, cx + r);
      maxY = Math.max(maxY, cy + r);
    }
    const PAD = 6;
    minX = Math.floor(minX) - PAD;
    minY = Math.floor(minY) - PAD;
    const cW = Math.ceil(maxX - minX) + PAD * 2;
    const cH = Math.ceil(maxY - minY) + PAD * 2;

    // ── Rasterise each panel as SOLID fill ──────────────────────────────
    // We draw a white-filled silhouette of each panel, then OR the masks.
    // Each panel is drawn on a separate 1-bit canvas so we get clean OR union.
    const unionMask = new Uint8Array(cW * cH); // 1 = inside union

    for (const { p, pw, ph, src } of items) {
      // Load image
      const img = await new Promise(res => {
        const i = new Image();
        i.crossOrigin = 'anonymous';
        i.onload = () => res(i);
        i.onerror = () => res(null);
        i.src = src;
      });
      if (!img) continue;

      // ── Draw with solid fill onto temp canvas ──
      // Strategy: draw the image onto canvas, then use the alpha channel
      // to build a per-panel mask, then for any pixel with ANY alpha draw
      // a solid opaque white. This captures the stroke outline.
      // Then flood-fill the interior of that outline to get a solid shape.

      const tc = document.createElement('canvas');
      tc.width = cW; tc.height = cH;
      const tx = tc.getContext('2d');

      tx.save();
      const cx = p.x + pw / 2 - minX;
      const cy = p.y + ph / 2 - minY;
      tx.translate(cx, cy);
      if (p.rot) tx.rotate(p.rot * Math.PI / 180);
      if (p.flip) tx.scale(-1, 1);
      tx.drawImage(img, -pw / 2, -ph / 2, pw, ph);
      tx.restore();

      const imgData = tx.getImageData(0, 0, cW, cH);
      const d = imgData.data;

      // Build stroke mask (pixels with any alpha = outline stroke)
      const strokeMask = new Uint8Array(cW * cH);
      for (let i = 0; i < cW * cH; i++) {
        strokeMask[i] = d[i * 4 + 3] > 20 ? 1 : 0;
      }

      // Flood-fill exterior from all borders (4-connected BFS)
      // Pixels that are NOT exterior AND NOT stroke = interior
      const ext = new Uint8Array(cW * cH);
      const queue = [];
      function tryEnqueue(x, y) {
        if (x < 0 || y < 0 || x >= cW || y >= cH) return;
        const idx = y * cW + x;
        if (ext[idx] || strokeMask[idx]) return;
        ext[idx] = 1;
        queue.push(x, y);
      }
      for (let x = 0; x < cW; x++) { tryEnqueue(x, 0); tryEnqueue(x, cH - 1); }
      for (let y = 0; y < cH; y++) { tryEnqueue(0, y); tryEnqueue(cW - 1, y); }
      let qi = 0;
      while (qi < queue.length) {
        const qx = queue[qi++], qy = queue[qi++];
        tryEnqueue(qx - 1, qy); tryEnqueue(qx + 1, qy);
        tryEnqueue(qx, qy - 1); tryEnqueue(qx, qy + 1);
      }

      // Panel mask = stroke pixels + interior pixels (anything not exterior)
      for (let i = 0; i < cW * cH; i++) {
        if (!ext[i]) unionMask[i] = 1; // OR into union
      }
    }

    // ── Marching squares contour tracing (directed-edge walker) ─────────
    // Uses directed edges so each segment A→B is consumed exactly once.
    // This correctly handles complex shapes with any number of edges/vertices.
    function traceContours(mask, W, H) {
      const TABLE = {
         1: [[2, 3]],       2: [[1, 2]],       3: [[1, 3]],
         4: [[0, 1]],       5: [[0, 2], [1, 3]], 6: [[0, 2]],
         7: [[0, 3]],       8: [[3, 0]],       9: [[2, 0]],
        10: [[2, 1], [3, 0]], 11: [[2, 0]],    12: [[3, 1]],
        13: [[2, 1]],      14: [[3, 2]]
      };

      function val(x, y) {
        if (x < 0 || y < 0 || x >= W || y >= H) return 0;
        return mask[y * W + x];
      }
      function edgePt(cx, cy, e) {
        if (e === 0) return [cx + 0.5, cy];
        if (e === 1) return [cx + 1,   cy + 0.5];
        if (e === 2) return [cx + 0.5, cy + 1];
        return [cx, cy + 0.5];
      }
      function ptKey(pt) { return Math.round(pt[0] * 2) + ',' + Math.round(pt[1] * 2); }
      function dirKey(k0, k1) { return k0 + '>' + k1; }

      // Build directed adjacency: each undirected segment → two directed edges
      const directed = new Map();
      function addDir(k0, k1) {
        if (!directed.has(k0)) directed.set(k0, []);
        directed.get(k0).push(k1);
      }

      for (let cy = 0; cy < H - 1; cy++) {
        for (let cx = 0; cx < W - 1; cx++) {
          const code = (val(cx, cy) << 3) | (val(cx + 1, cy) << 2) |
                       (val(cx + 1, cy + 1) << 1) | val(cx, cy + 1);
          const segs = TABLE[code];
          if (!segs) continue;
          for (const [e0, e1] of segs) {
            const p0 = edgePt(cx, cy, e0), p1 = edgePt(cx, cy, e1);
            const k0 = ptKey(p0), k1 = ptKey(p1);
            addDir(k0, k1); // forward A→B
            addDir(k1, k0); // reverse B→A
          }
        }
      }

      // Consume directed edges to form closed contours
      // prevK guard: skip the reverse of the edge we just came from
      // to prevent immediate backtracking (which creates spurious 2-pt loops).
      const usedEdges = new Set();
      const contours = [];

      for (const [startK] of directed) {
        const neighbors = directed.get(startK) || [];
        if (!neighbors.some(nk => !usedEdges.has(dirKey(startK, nk)))) continue;

        const pts = [];
        let curK = startK;
        let prevK = null;
        let safety = 0;

        while (safety++ < 1000000) {
          const nexts = directed.get(curK) || [];
          const nextK = nexts.find(nk => nk !== prevK && !usedEdges.has(dirKey(curK, nk)));
          if (nextK === undefined) break;

          usedEdges.add(dirKey(curK, nextK));
          const [x, y] = curK.split(',').map(v => v / 2);
          pts.push([x, y]);
          prevK = curK;
          curK = nextK;

          if (curK === startK) break; // closed loop
        }

        if (pts.length >= 4) contours.push(pts);
      }
      return contours;
    }

    // ── RDP simplification ───────────────────────────────────────────────
    function rdp(pts, eps) {
      if (pts.length <= 2) return pts;
      const [x1, y1] = pts[0], [x2, y2] = pts[pts.length - 1];
      const dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
      let maxD = 0, idx = 0;
      for (let i = 1; i < pts.length - 1; i++) {
        const [px, py] = pts[i];
        const d = len < 1e-9
          ? Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
          : Math.abs(dy * (px - x1) - dx * (py - y1)) / len;
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > eps) {
        return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1),
                ...rdp(pts.slice(idx), eps)];
      }
      return [pts[0], pts[pts.length - 1]];
    }

    // ── Morphological close: dilate then erode the union mask ────────────
    // This closes thin gaps where panels touch/cross at a point, ensuring
    // the marching squares traces ONE outer boundary, not split contours.
    function dilate(mask, W, H, r) {
      const out = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (mask[y * W + x]) {
            for (let dy = -r; dy <= r; dy++) {
              for (let dx = -r; dx <= r; dx++) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && ny >= 0 && nx < W && ny < H) {
                  out[ny * W + nx] = 1;
                }
              }
            }
          }
        }
      }
      return out;
    }
    function erode(mask, W, H, r) {
      const out = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let keep = true;
          outer: for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              const nx = x + dx, ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= W || ny >= H || !mask[ny * W + nx]) {
                keep = false; break outer;
              }
            }
          }
          out[y * W + x] = keep ? 1 : 0;
        }
      }
      return out;
    }
    // Close radius 3px: bridges 1-2px gaps between touching panels
    const CLOSE_R = 3;
    const closedMask = erode(dilate(unionMask, cW, cH, CLOSE_R), cW, cH, CLOSE_R);

    // ── Classify contours: outer vs genuine holes ─────────────────────────
    function signedArea(pts) {
      let a = 0;
      for (let i = 0, n = pts.length; i < n; i++) {
        const j = (i + 1) % n;
        a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
      }
      return a / 2;
    }

    // Point-in-polygon test — used to find genuine interior holes
    function pointInPolygon(px, py, pts) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], yi = pts[i][1];
        const xj = pts[j][0], yj = pts[j][1];
        if ((yi > py) !== (yj > py) &&
            px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
      return inside;
    }

    // Trace contours on the morphologically-closed mask
    const rawContours = traceContours(closedMask, cW, cH);

    if (rawContours.length === 0) {
      alert('Could not trace a merged outline.\nTip: make sure the panels overlap or touch each other.');
      btn.textContent = prevText; updateMergeBtn(); return;
    }

    // Sort by absolute area desc → largest = outer boundary
    rawContours.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));

    // Minimum area threshold: discard pixel-noise artifacts (< 16 px²)
    const MIN_AREA = 16;
    const EPS = 1.2;
    const simplified = rawContours
      .filter(c => Math.abs(signedArea(c)) >= MIN_AREA)
      .map(c => rdp(c, EPS))
      .filter(c => c.length >= 3);

    if (!simplified.length) {
      alert('Merge outline could not be simplified. Try adjusting panel overlap.');
      btn.textContent = prevText; updateMergeBtn(); return;
    }

    // The largest contour is the true outer boundary.
    // Smaller contours inside it are genuine holes (e.g. enclosed voids).
    // Contours NOT inside the outer boundary are stray fragments → discard.
    const outerRaw = simplified[0];
    const trueHoles = simplified.slice(1).filter(c => {
      const cx = c.reduce((s, p) => s + p[0], 0) / c.length;
      const cy = c.reduce((s, p) => s + p[1], 0) / c.length;
      return pointInPolygon(cx, cy, outerRaw);
    });

    // ── Translate back to workspace coords ───────────────────────────────
    function toWS(pts) {
      return pts.map(([x, y]) => ({ x: parseFloat((x + minX).toFixed(1)),
                                     y: parseFloat((y + minY).toFixed(1)) }));
    }

    const outerPts = toWS(outerRaw);
    const holes    = trueHoles.map(toWS);

    // ── Build SVG d-string ───────────────────────────────────────────────
    function ptsToD(pts, forceWindingCW) {
      // Compute winding; reverse if needed
      const sa = signedArea(pts.map(n => [n.x, n.y]));
      const pts2 = (forceWindingCW ? sa > 0 : sa < 0) ? [...pts].reverse() : pts;
      let d = 'M' + pts2[0].x + ',' + pts2[0].y;
      for (let i = 1; i < pts2.length; i++) d += ' L' + pts2[i].x + ',' + pts2[i].y;
      return d + ' Z';
    }

    // Outer: CCW (negative signed area in screen-y-down coords = positive orientation)
    // Holes: CW (opposite to outer → evenodd fill punches holes)
    let fullD = ptsToD(outerPts, false);
    for (const h of holes) fullD += ' ' + ptsToD(h, true);

    // ── Create merged panel object ────────────────────────────────────────
    const allPts = outerPts.concat(...holes);
    const bxs = allPts.map(n => n.x), bys = allPts.map(n => n.y);
    const bx = Math.min(...bxs), by = Math.min(...bys);
    const bw = Math.max(...bxs) - bx, bh = Math.max(...bys) - by;

    const pid = 'wp_' + Date.now() + '_mrg';
    const np = {
      id: pid, src: '',
      x: bx, y: by,
      rot: 0, flip: false, scale: 1,
      penData: {
        nodes: outerPts.map(n => ({ x: n.x, y: n.y, handleIn: null, handleOut: null })),
        closed: true,
        mergedD: fullD,   // full compound path (outer + holes)
        isMerged: true
      },
      _mergedD: fullD,
      _bbox: { x: bx, y: by, w: bw, h: bh }
    };

    wsPanels.push(np);
    renderMergedPanel(np);
    updateEmptyState();
    selectOnly(np.id);
    bringToTop(np.id);

  } catch (err) {
    console.error('Merge failed:', err);
    alert('Merge failed: ' + err.message);
  }

  btn.textContent = prevText;
  updateMergeBtn();
}

// ── Render the merged panel as an absolutely-positioned SVG overlay ─────────
// The SVG spans the whole workspace (0,0 → WS_W,WS_H) so the path sits at
// exact workspace coordinates without any coordinate transform trickery.
function renderMergedPanel(p) {
  // Remove existing element if re-rendering
  document.getElementById(p.id)?.remove();

  const ws = document.getElementById('workspace');
  const div = document.createElement('div');
  div.className = 'ws-panel-el'; div.id = p.id;
  // Position the div at the path's bounding box for click/drag hit area
  const bb = p._bbox;
  div.style.cssText = `position:absolute;left:${bb.x}px;top:${bb.y}px;` +
    `width:${bb.w}px;height:${bb.h}px;z-index:${++zCounter};cursor:move;`;

  // The div is positioned at (bb.x, bb.y) via CSS left/top.
  // So the SVG viewBox must use local coords (0,0) and the path d-string
  // must be translated to local space (subtract bb.x, bb.y).
  function localD(d, ox, oy) {
    return d.replace(/(M|L)\s*([-\d.]+),([-\d.]+)/g, (_, cmd, x, y) =>
      cmd + (parseFloat(x) - ox).toFixed(1) + ',' + (parseFloat(y) - oy).toFixed(1));
  }
  const ld = localD(p._mergedD, bb.x, bb.y);

  div.innerHTML = `
    <div class="panel-map-badge" id="badge-${p.id}"></div>
    <svg xmlns="http://www.w3.org/2000/svg" class="merged-panel-svg"
         style="position:absolute;left:0;top:0;pointer-events:none;display:block"
         width="${bb.w}" height="${bb.h}"
         viewBox="0 0 ${bb.w} ${bb.h}">
      <path d="${ld}"
        fill="${p.fillColor && p.fillColor !== 'none' ? p.fillColor : '#f0f0eb'}" fill-rule="evenodd"
        stroke="#3a3a3a" stroke-width="1.5"
        stroke-linejoin="round"/>
    </svg>
    <div class="pctrl" style="position:absolute;top:${bb.h + 2}px;left:0;position:relative">
      <button onclick="toggleColorPopover('${p.id}',this)" title="Fill colour" style="display:flex;align-items:center;gap:3px"><span class="fill-swatch"></span></button>
      <button onclick="rmWS('${p.id}')">× Remove</button>
    </div>`;

  ws.appendChild(div);

  // Initialise swatch for merged/traced panels
  const msw = div.querySelector('.fill-swatch');
  if (msw) updateSwatchStyle(msw, p.fillColor || 'none');

  // ── Drag support ──────────────────────────────────────────────────────
  div.addEventListener('mousedown', e => {
    if (e.target.tagName === 'BUTTON') return;
    if (!mapMode && hasOverlapAt(p.id, e.clientX, e.clientY) && !isPointOpaqueOnPanel(p, e.clientX, e.clientY)) { passClickToPanelBelow(div, e); return; }
    e.preventDefault(); e.stopPropagation();
    if (!selectedIds.has(p.id)) selectOnly(p.id); else updateMergeBtn();
    snapshotForUndo();

    const wsEl = document.getElementById('workspace');
    const rect = wsEl.getBoundingClientRect();
    const scX = WS_W / rect.width, scY = WS_H / rect.height;
    const ox = e.clientX, oy = e.clientY;
    const sx = p._bbox.x, sy = p._bbox.y;

    // Parse all points from the current mergedD
    function shiftD(d, dx, dy) {
      // Handle optional leading minus sign on coordinates
      return d.replace(/(M|L)\s*([-\d.]+),([-\d.]+)/g, (_, cmd, x, y) => {
        return cmd + (parseFloat(x) + dx).toFixed(1) + ',' + (parseFloat(y) + dy).toFixed(1);
      });
    }

    function onMove(ev) {
      const dx = (ev.clientX - ox) * scX;
      const dy = (ev.clientY - oy) * scY;
      const nx = sx + dx, ny = sy + dy;
      const ddx = nx - p._bbox.x, ddy = ny - p._bbox.y;
      p._bbox.x = nx; p._bbox.y = ny;
      p.x = nx; p.y = ny;
      p._mergedD = shiftD(p._mergedD, ddx, ddy);
      p.penData.mergedD = p._mergedD;
      p.penData.nodes.forEach(n => { n.x += ddx; n.y += ddy; });
      // Re-render with updated position
      renderMergedPanel(p);
      bringToTop(p.id);
      selectOnly(p.id);
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}



// ════════════════════════════════════════════════════════════════════════════
//  TRACE — Exact outer contour of selected panels
// ════════════════════════════════════════════════════════════════════════════
//
//  Algorithm (vector-accurate, no pixel approximation):
//
//  1. For each selected panel, fetch its SVG source and parse all shape
//     elements (<path>, <polygon>, <polyline>, <rect>, etc.)
//
//  2. Transform each element's geometry into workspace coordinates using
//     the panel's (x, y, scale, rot, flip) — same transform used in SVG export.
//
//  3. Flatten all curved path segments into dense polylines by sampling
//     cubic bezier curves at adaptive resolution (≈ 1px per sample at scale).
//
//  4. Rasterise the combined geometry onto a high-resolution offscreen canvas
//     (4× workspace scale) — draw each panel's FILLED silhouette.
//
//  5. Apply a morphological close (dilate + erode, radius 2) to merge any
//     sub-pixel gaps between touching panels.
//
//  6. Trace the outer contour using marching squares, then:
//     a. RDP-simplify straight runs (very low eps = 0.5px at 4× scale)
//     b. Re-fit cubic beziers over curved sections for smooth output
//
//  7. Output as a new pen-drawn panel with the SVG path stored in mergedD,
//     draggable and exportable like any other workspace element.
//
// ════════════════════════════════════════════════════════════════════════════

async function traceSelectedPanels() {
  const ids = [...selectedIds];
  if (ids.length < 1) return;
  snapshotForUndo();

  const tBtn = document.getElementById('btn-trace');
  const prevText = tBtn.textContent;
  tBtn.textContent = 'Tracing…'; tBtn.disabled = true;

  try {
    // ── Collect panels ──────────────────────────────────────────────────
    const items = [];
    for (const id of ids) {
      const p = wsPanels.find(q => q.id === id);
      if (!p) continue;
      const imgEl = document.getElementById(id)?.querySelector('.pimg');
      if (!imgEl) continue;
      const pw = Math.round(100 * p.scale);
      const ph = Math.round(pw * (imgEl.naturalHeight / imgEl.naturalWidth));
      items.push({ p, pw, ph });
    }
    if (!items.length) { tBtn.textContent = prevText; tBtn.disabled = false; return; }

    // ────────────────────────────────────────────────────────────────────
    //  STRATEGY: Try direct SVG vertex extraction first.
    //  The tray panels are SVG files whose shapes are polygons or paths
    //  with only straight edges (M/L/Z). We can get the exact corner
    //  coordinates by applying each panel's transform matrix to the SVG
    //  vertices — no rasterisation, no staircase, no RDP needed.
    //  Fall back to raster/marching-squares only for curved shapes.
    // ────────────────────────────────────────────────────────────────────

    // Helper: build a 2D transform matrix from panel position/rotation/flip
    // Returns a function that maps (vbX, vbY) → workspace [x, y]
    function panelTransform(p, pw, ph, vb) {
      // Scale from viewBox → rendered pixels
      const sx = pw / vb.w;
      const sy = ph / vb.h;
      const cosR = Math.cos((p.rot || 0) * Math.PI / 180);
      const sinR = Math.sin((p.rot || 0) * Math.PI / 180);
      const flipX = p.flip ? -1 : 1;
      // Panel centre in workspace
      const cxWS = p.x + pw / 2;
      const cyWS = p.y + ph / 2;

      return (vbx, vby) => {
        // 1. Translate from viewBox origin → pixel offset from panel top-left
        const lx = (vbx - vb.x) * sx - pw / 2;
        const ly = (vby - vb.y) * sy - ph / 2;
        // 2. Apply flip (around panel centre)
        const fx = lx * flipX;
        const fy = ly;
        // 3. Apply rotation (around panel centre)
        const rx = fx * cosR - fy * sinR;
        const ry = fx * sinR + fy * cosR;
        // 4. Translate to workspace
        return [cxWS + rx, cyWS + ry];
      };
    }

    // Helper: extract all vertices from a path `d` attribute (straight edges only)
    // Returns null if path contains curves (C/c/S/s/Q/q/A/a commands)
    function extractPathVertices(d) {
      if (/[CSQAcsqa]/.test(d)) return null; // has curves
      const verts = [];
      const cmds = d.trim().match(/[MLHVZmlhvz][^MLHVZmlhvz]*/g) || [];
      let cx = 0, cy = 0, sx = 0, sy = 0;
      for (const cmd of cmds) {
        const type = cmd[0];
        const nums = cmd.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number);
        if (type === 'M') { cx = nums[0]; cy = nums[1]; sx = cx; sy = cy; verts.push([cx, cy]); }
        else if (type === 'm') { cx += nums[0]; cy += nums[1]; sx = cx; sy = cy; verts.push([cx, cy]); }
        else if (type === 'L') { for (let i=0;i<nums.length;i+=2){cx=nums[i];cy=nums[i+1];verts.push([cx,cy]);} }
        else if (type === 'l') { for (let i=0;i<nums.length;i+=2){cx+=nums[i];cy+=nums[i+1];verts.push([cx,cy]);} }
        else if (type === 'H') { cx = nums[0]; verts.push([cx, cy]); }
        else if (type === 'h') { cx += nums[0]; verts.push([cx, cy]); }
        else if (type === 'V') { cy = nums[0]; verts.push([cx, cy]); }
        else if (type === 'v') { cy += nums[0]; verts.push([cx, cy]); }
        else if (type === 'Z' || type === 'z') { cx = sx; cy = sy; /* close — don't push duplicate */ }
      }
      // Remove duplicate last point if it equals the first (path closure)
      if (verts.length > 1) {
        const last = verts[verts.length - 1];
        const first = verts[0];
        if (Math.abs(last[0] - first[0]) < 0.01 && Math.abs(last[1] - first[1]) < 0.01) {
          verts.pop();
        }
      }
      return verts.length >= 3 ? verts : null;
    }

    // Helper: extract vertices from a polygon/polyline `points` attribute
    function extractPolyVertices(pts) {
      const nums = pts.trim().split(/[\s,]+/).filter(Boolean).map(Number);
      const verts = [];
      for (let i = 0; i < nums.length - 1; i += 2) verts.push([nums[i], nums[i+1]]);
      return verts.length >= 3 ? verts : null;
    }

    // Helper: parse SVG viewBox
    function parseViewBox(svgEl) {
      const vb = (svgEl.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
      return {
        x: vb[0] || 0, y: vb[1] || 0,
        w: vb[2] || parseFloat(svgEl.getAttribute('width') || '100'),
        h: vb[3] || parseFloat(svgEl.getAttribute('height') || '100')
      };
    }

    // ── Attempt geometry-exact extraction ────────────────────────────────
    // Collect all workspace-coordinate polygon rings from all panels
    let allPolygons = []; // array of [[x,y], ...]
    let usedGeomExtract = true;

    for (const { p, pw, ph } of items) {
      const svgText = await fetchSvgTextForTrace(p.src);
      if (!svgText) { usedGeomExtract = false; break; }

      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');
      if (!svgEl) { usedGeomExtract = false; break; }

      const vb = parseViewBox(svgEl);
      const toWS = panelTransform(p, pw, ph, vb);

      let foundShape = false;
      for (const el of svgEl.querySelectorAll('path,polygon,polyline,rect')) {
        const tag = el.tagName.toLowerCase();
        let vbVerts = null;

        if (tag === 'path') {
          vbVerts = extractPathVertices(el.getAttribute('d') || '');
        } else if (tag === 'polygon' || tag === 'polyline') {
          vbVerts = extractPolyVertices(el.getAttribute('points') || '');
        } else if (tag === 'rect') {
          const rx = parseFloat(el.getAttribute('x') || '0');
          const ry = parseFloat(el.getAttribute('y') || '0');
          const rw = parseFloat(el.getAttribute('width') || '0');
          const rh = parseFloat(el.getAttribute('height') || '0');
          vbVerts = [[rx,ry],[rx+rw,ry],[rx+rw,ry+rh],[rx,ry+rh]];
        }

        if (vbVerts) {
          // Apply panel transform to each vertex
          allPolygons.push(vbVerts.map(([vx, vy]) => toWS(vx, vy)));
          foundShape = true;
          // Use the LARGEST shape in the SVG (skip small decorative elements)
          break;
        }
      }

      if (!foundShape) { usedGeomExtract = false; break; }
    }

    let wsPts;

    if (usedGeomExtract && allPolygons.length > 0) {
      // ── Single panel: use its polygon directly ─────────────────────────
      if (allPolygons.length === 1) {
        wsPts = allPolygons[0];
      } else {
        // ── Multiple panels: compute convex hull of all vertices ──────────
        // (For multi-panel trace, fall back to raster union — see below)
        usedGeomExtract = false;
      }
    }

    // ── Fallback: raster + marching squares (for curves / multi-panel) ───
    if (!usedGeomExtract || !wsPts) {
      // Compute bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const { p, pw, ph } of items) {
        const r = Math.ceil(Math.sqrt(pw * pw + ph * ph) / 2) + 8;
        const cx = p.x + pw / 2, cy = p.y + ph / 2;
        minX = Math.min(minX, cx - r); minY = Math.min(minY, cy - r);
        maxX = Math.max(maxX, cx + r); maxY = Math.max(maxY, cy + r);
      }
      const PAD = 8;
      minX = Math.floor(minX) - PAD; minY = Math.floor(minY) - PAD;

      const SCALE = 4;
      const cW = (Math.ceil(maxX - minX) + PAD * 2) * SCALE;
      const cH = (Math.ceil(maxY - minY) + PAD * 2) * SCALE;

      const canvas = document.createElement('canvas');
      canvas.width = cW; canvas.height = cH;
      const ctx = canvas.getContext('2d');

      function applyPanelTransform(ctx, p, pw, ph, scaleUp) {
        const cx = (p.x + pw / 2 - minX) * scaleUp;
        const cy = (p.y + ph / 2 - minY) * scaleUp;
        ctx.translate(cx, cy);
        if (p.rot) ctx.rotate(p.rot * Math.PI / 180);
        if (p.flip) ctx.scale(-1, 1);
      }

      for (const { p, pw, ph } of items) {
        const svgText = await fetchSvgTextForTrace(p.src);
        if (!svgText) continue;
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgText, 'image/svg+xml');
        const svgEl = doc.querySelector('svg');
        if (!svgEl) continue;
        const vb = parseViewBox(svgEl);
        const sx = (pw / vb.w) * SCALE;
        const sy = (ph / vb.h) * SCALE;
        ctx.save();
        applyPanelTransform(ctx, p, pw, ph, SCALE);
        ctx.translate(-pw / 2 * SCALE, -ph / 2 * SCALE);
        ctx.scale(sx, sy);
        ctx.translate(-vb.x, -vb.y);
        ctx.fillStyle = '#000';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5 / Math.min(sx, sy);
        svgEl.querySelectorAll('path,polygon,polyline,rect,circle,ellipse').forEach(el => {
          const tag = el.tagName.toLowerCase();
          ctx.beginPath();
          if (tag === 'path') {
            const path2d = new Path2D(el.getAttribute('d') || '');
            ctx.fill(path2d, 'nonzero'); ctx.stroke(path2d);
          } else if (tag === 'polygon' || tag === 'polyline') {
            const pts2 = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
            if (pts2.length >= 2) {
              ctx.moveTo(pts2[0], pts2[1]);
              for (let i = 2; i < pts2.length; i += 2) ctx.lineTo(pts2[i], pts2[i+1]);
              if (tag === 'polygon') ctx.closePath();
              ctx.fill(); ctx.stroke();
            }
          } else if (tag === 'rect') {
            const rx=parseFloat(el.getAttribute('x')||'0'),ry=parseFloat(el.getAttribute('y')||'0');
            const rw=parseFloat(el.getAttribute('width')||'0'),rh=parseFloat(el.getAttribute('height')||'0');
            ctx.fillRect(rx,ry,rw,rh); ctx.strokeRect(rx,ry,rw,rh);
          } else if (tag === 'circle') {
            const cx2=parseFloat(el.getAttribute('cx')||'0'),cy2=parseFloat(el.getAttribute('cy')||'0'),r=parseFloat(el.getAttribute('r')||'0');
            ctx.arc(cx2,cy2,r,0,Math.PI*2); ctx.fill(); ctx.stroke();
          } else if (tag === 'ellipse') {
            const cx2=parseFloat(el.getAttribute('cx')||'0'),cy2=parseFloat(el.getAttribute('cy')||'0');
            const rx=parseFloat(el.getAttribute('rx')||'0'),ry=parseFloat(el.getAttribute('ry')||'0');
            ctx.ellipse(cx2,cy2,rx,ry,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
          }
        });
        ctx.restore();
      }

      const imgData = ctx.getImageData(0, 0, cW, cH).data;
      const unionMask = new Uint8Array(cW * cH);
      for (let i = 0; i < cW * cH; i++) unionMask[i] = imgData[i*4+3] > 20 ? 1 : 0;

      // Marching squares
      function traceContour(mask, W, H) {
        const TABLE = {
           1:[[2,3]],  2:[[1,2]],  3:[[1,3]],
           4:[[0,1]],  5:[[0,2],[1,3]],  6:[[0,2]],
           7:[[0,3]],  8:[[3,0]],  9:[[2,0]],
          10:[[2,1],[3,0]], 11:[[2,0]], 12:[[3,1]],
          13:[[2,1]], 14:[[3,2]]
        };
        function val(x,y){return(x<0||y<0||x>=W||y>=H)?0:mask[y*W+x];}
        function edgePt(cx,cy,e){return e===0?[cx+0.5,cy]:e===1?[cx+1,cy+0.5]:e===2?[cx+0.5,cy+1]:[cx,cy+0.5];}
        function K(p){return Math.round(p[0]*2)+','+Math.round(p[1]*2);}
        const adj=new Map();
        function addEdge(k0,k1){if(!adj.has(k0))adj.set(k0,[]);adj.get(k0).push(k1);}
        for(let y=0;y<H-1;y++)for(let x=0;x<W-1;x++){
          const code=(val(x,y)<<3)|(val(x+1,y)<<2)|(val(x+1,y+1)<<1)|val(x,y+1);
          const segs=TABLE[code];if(!segs)continue;
          for(const[e0,e1]of segs){const k0=K(edgePt(x,y,e0)),k1=K(edgePt(x,y,e1));addEdge(k0,k1);addEdge(k1,k0);}
        }
        const usedEdges=new Set(),contours=[];
        for(const startK of adj.keys()){
          if(!(adj.get(startK)||[]).some(tk=>!usedEdges.has(startK+'|'+tk)))continue;
          const pts=[];let curK=startK,prevK=null,safety=0;
          while(safety++<2000000){
            const outs=adj.get(curK)||[];
            let toK=outs.find(tk=>tk!==prevK&&!usedEdges.has(curK+'|'+tk));
            if(toK===undefined)break;
            usedEdges.add(curK+'|'+toK);
            const cv=curK.split(',');pts.push([+cv[0]/2,+cv[1]/2]);
            prevK=curK;curK=toK;if(curK===startK)break;
          }
          if(pts.length>=4)contours.push(pts);
        }
        return contours;
      }

      const rawContours = traceContour(unionMask, cW, cH);
      if (!rawContours.length) {
        alert('Trace: could not find an outline.'); tBtn.textContent = prevText; updateMergeBtn(); return;
      }

      function signedArea(pts){let a=0;for(let i=0,n=pts.length;i<n;i++){const j=(i+1)%n;a+=pts[i][0]*pts[j][1]-pts[j][0]*pts[i][1];}return a/2;}
      rawContours.sort((a,b)=>Math.abs(signedArea(b))-Math.abs(signedArea(a)));

      // RDP with adaptive epsilon: enough to reduce staircase but not merge real edges
      function rdp(pts, eps) {
        if (pts.length <= 2) return pts;
        const [x1,y1]=pts[0],[x2,y2]=pts[pts.length-1];
        const dx=x2-x1,dy=y2-y1,len=Math.sqrt(dx*dx+dy*dy);
        let maxD=0,idx=0;
        for(let i=1;i<pts.length-1;i++){
          const[px,py]=pts[i];
          const d=len<1e-9?Math.sqrt((px-x1)**2+(py-y1)**2):Math.abs(dy*(px-x1)-dx*(py-y1))/len;
          if(d>maxD){maxD=d;idx=i;}
        }
        if(maxD>eps)return[...rdp(pts.slice(0,idx+1),eps).slice(0,-1),...rdp(pts.slice(idx),eps)];
        return[pts[0],pts[pts.length-1]];
      }

      // Use a tighter epsilon: 0.3 px at 4× scale.
      // This only removes staircase sub-pixel noise while keeping all real corners.
      const simplified = rdp(rawContours[0], 0.3);

      const wsScale = 1 / SCALE;
      wsPts = simplified.map(([x, y]) => [
        parseFloat((x * wsScale + minX).toFixed(2)),
        parseFloat((y * wsScale + minY).toFixed(2))
      ]);
    }

    // ── Remove collinear / near-collinear points ──────────────────────────
    // This is the key step: after either extraction method, remove any
    // points that lie on the straight line between their neighbours.
    // Threshold: 0.5 workspace-px perpendicular deviation = keep corner.
    function removeCollinear(pts, threshold = 0.5) {
      if (pts.length <= 3) return pts;
      const result = [];
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const prev = pts[(i - 1 + n) % n];
        const curr = pts[i];
        const next = pts[(i + 1) % n];
        const dx = next[0] - prev[0], dy = next[1] - prev[1];
        const len = Math.sqrt(dx*dx + dy*dy);
        const dist = len < 1e-9
          ? Math.sqrt((curr[0]-prev[0])**2 + (curr[1]-prev[1])**2)
          : Math.abs(dy*(curr[0]-prev[0]) - dx*(curr[1]-prev[1])) / len;
        if (dist > threshold) result.push(curr);
      }
      return result.length >= 3 ? result : pts;
    }

    wsPts = removeCollinear(wsPts, 0.5);

    // Build path
    function buildPath(pts) {
      if (!pts.length) return '';
      let d = `M${pts[0][0]},${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) d += ` L${pts[i][0]},${pts[i][1]}`;
      return d + ' Z';
    }

    const fullD = buildPath(wsPts);
    const bxs = wsPts.map(p => p[0]), bys = wsPts.map(p => p[1]);
    const bx = Math.min(...bxs), by = Math.min(...bys);
    const bw = Math.max(...bxs) - bx, bh = Math.max(...bys) - by;

    const pid = 'wp_' + Date.now() + '_trace';
    const np = {
      id: pid, src: '', x: bx, y: by,
      rot: 0, flip: false, scale: 1,
      penData: {
        nodes: wsPts.map(([x,y]) => ({x,y,handleIn:null,handleOut:null})),
        closed: true, mergedD: fullD, isMerged: true
      },
      _mergedD: fullD,
      _bbox: { x: bx, y: by, w: bw, h: bh }
    };

    wsPanels.push(np);
    renderMergedPanel(np);
    updateEmptyState();
    selectOnly(np.id);
    bringToTop(np.id);

  } catch(err) {
    console.error('Trace failed:', err);
    alert('Trace failed: ' + err.message);
  }

  tBtn.textContent = prevText;
  updateMergeBtn();
}

async function fetchSvgTextForTrace(url) {
  if (!url) return '';
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    if (comma === -1) return '';
    const meta = url.slice(5, comma); // e.g. "image/svg+xml;base64" or "image/svg+xml"
    const payload = url.slice(comma + 1);
    if (/;base64/i.test(meta)) {
      try { return atob(payload); } catch(e) { return ''; }
    }
    // Plain (non-base64) data URI — payload is percent-encoded (or raw) text
    try { return decodeURIComponent(payload); } catch(e) { return payload; }
  }
  try { return await fetch(url).then(r => r.text()); } catch(e) { return ''; }
}


// ════════════════════════════════════════════════════════════════════════════
//  FILL COLOUR — swatch, popover, apply
// ════════════════════════════════════════════════════════════════════════════

const SWATCH_COLOURS = [
  '#f5c0c0','#f5a0a0','#e06060',
  '#f5ddb0','#f5c860','#e0a020',
  '#d4efc0','#a0d870','#4a9e30',
  '#c0dff5','#80b8f0','#2060c0',
  '#e0c8f5','#c090e8','#7040b0',
  '#f5c8e8','#e880c0','#a02070',
  '#c8e8e8','#80c8c8','#308888',
  '#e8e8c0','#c8c840','#888820',
  '#d0d0d0','#a0a0a0','#606060',
  '#ffffff','#1a1a1a',
];

function updateSwatchStyle(swEl, colour) {
  if (!swEl) return;
  if (!colour || colour === 'none') {
    swEl.className = 'fill-swatch none';
    swEl.style.background = '';
  } else {
    swEl.className = 'fill-swatch';
    swEl.style.background = colour;
  }
}

let _colourPopoverPanelId = null;
let _colourPopoverEl = null;

function closeColourPopover() {
  if (_colourPopoverEl) { _colourPopoverEl.remove(); _colourPopoverEl = null; }
  _colourPopoverPanelId = null;
}

function toggleColorPopover(panelId, btn) {
  // If already open for this panel, close it
  if (_colourPopoverPanelId === panelId) { closeColourPopover(); return; }
  closeColourPopover();

  const p = wsPanels.find(q => q.id === panelId);
  if (!p) return;

  const pop = document.createElement('div');
  pop.className = 'color-popover';
  _colourPopoverEl = pop;
  _colourPopoverPanelId = panelId;

  pop.innerHTML = `
    <div class="color-popover-title">Fill Colour</div>
    <div class="color-swatch-grid" id="cpg-${panelId}"></div>
    <div class="color-popover-custom">
      <span>Custom:</span>
      <input type="color" id="cp-custom-${panelId}" value="${(p.fillColor && p.fillColor !== 'none') ? p.fillColor : '#f5f5f5'}"
        oninput="applyFillColor('${panelId}', this.value)">
    </div>
    <button class="color-popover-none" onclick="applyFillColor('${panelId}','none');closeColourPopover()">✕ Remove fill</button>`;

  // Position popover near button
  const btnRect = btn.getBoundingClientRect();
  const wsEl = document.getElementById('workspace');
  const wsRect = wsEl.getBoundingClientRect();
  const panelEl = document.getElementById(panelId);

  // Append to workspace for proper z-layering
  pop.style.cssText = 'position:fixed;left:' + btnRect.left + 'px;top:' + (btnRect.bottom + 4) + 'px;';
  document.body.appendChild(pop);

  // Build swatch grid
  const grid = pop.querySelector('#cpg-' + panelId);
  SWATCH_COLOURS.forEach(c => {
    const sp = document.createElement('span');
    sp.style.background = c;
    if (p.fillColor === c) sp.classList.add('active');
    sp.title = c;
    sp.addEventListener('click', () => {
      applyFillColor(panelId, c);
      closeColourPopover();
    });
    grid.appendChild(sp);
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function _outside(e) {
      if (!pop.contains(e.target) && e.target !== btn) {
        closeColourPopover();
        document.removeEventListener('click', _outside);
      }
    });
  }, 0);
}

// Inject fill colour directly into an SVG data-URI, colouring all stroke-only paths
function svgWithFill(src, colour) {
  // Decode the base64 SVG
  let svgText = '';
  if (src.startsWith('data:image/svg+xml;base64,')) {
    try { svgText = atob(src.slice(26)); } catch(e) { return src; }
  } else if (src.startsWith('data:image/svg+xml,')) {
    svgText = decodeURIComponent(src.slice(19));
  } else {
    return src; // can't re-encode remote URLs
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) return src;

  const fillVal = (!colour || colour === 'none') ? 'none' : colour;
  const strokeVal = '#231f20'; // preserve original stroke

  // Illustrator's SVG export commonly includes a full-artboard background/
  // frame <rect> alongside the real shape (invisible until tinted). If we
  // recolor it too, it becomes visible, sits on top (later in paint order),
  // and covers the actual garment shape underneath with a plain rectangle —
  // exactly what "shapes disappearing into a rectangle" looks like. Detect
  // and skip any rect that spans (almost) the whole viewBox, as long as
  // there's at least one other shape to actually be the real content.
  const vbAttr = (svgEl.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
  const vbW = vbAttr[2] || parseFloat(svgEl.getAttribute('width')||'0') || 0;
  const vbH = vbAttr[3] || parseFloat(svgEl.getAttribute('height')||'0') || 0;
  const allShapeEls = [...svgEl.querySelectorAll('path,polygon,polyline,rect,circle,ellipse,line')];
  function isFullCanvasBackgroundRect(el){
    if (el.tagName.toLowerCase() !== 'rect') return false;
    if (allShapeEls.length < 2) return false; // the only shape present IS the garment piece — keep it
    if (!vbW || !vbH) return false;
    const rx=parseFloat(el.getAttribute('x')||'0'), ry=parseFloat(el.getAttribute('y')||'0');
    const rw=parseFloat(el.getAttribute('width')||'0'), rh=parseFloat(el.getAttribute('height')||'0');
    return rx<=vbW*0.02 && ry<=vbH*0.02 && (rw*rh)/(vbW*vbH) > 0.9;
  }

  // Apply fill to every real shape element (skipping background frames)
  allShapeEls.forEach(el => {
    if (isFullCanvasBackgroundRect(el)) return;
    if (fillVal === 'none') {
      // Restore: remove injected fill, keep original none/stroke-only
      el.removeAttribute('data-orig-fill');
      // If element originally had no fill or fill:none, restore that
      const origFill = el.getAttribute('data-orig-fill');
      el.setAttribute('fill', origFill !== null ? origFill : 'none');
      el.removeAttribute('data-orig-fill');
    } else {
      // Save original fill if not already saved
      if (!el.hasAttribute('data-orig-fill')) {
        el.setAttribute('data-orig-fill', el.getAttribute('fill') || 'none');
      }
      el.setAttribute('fill', fillVal);
      el.setAttribute('fill-opacity', '0.55');
    }
  });

  let newSvg = new XMLSerializer().serializeToString(svgEl);
  // A standalone SVG document needs an explicit namespace — DOMParser can
  // parse <svg> correctly via the 'image/svg+xml' MIME type without ever
  // writing xmlns as a real attribute, so XMLSerializer can silently omit
  // it. Without it, browsers reject the string when loaded via <img src>,
  // which is why a recolored panel can vanish entirely from exports.
  if (!/xmlns\s*=/.test(newSvg.slice(0, 200))) {
    newSvg = newSvg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(newSvg)));
}

function applyFillColor(panelId, colour) {
  const p = wsPanels.find(q => q.id === panelId);
  if (!p) return;
  snapshotForUndo();
  p.fillColor = colour;

  const div = document.getElementById(panelId);
  if (!div) return;

  // Update all swatches on this panel element
  div.querySelectorAll('.fill-swatch').forEach(sw => updateSwatchStyle(sw, colour));

  // ── Merged/traced panel — update SVG path fill directly ──
  const svgPath = div.querySelector('.merged-panel-svg path');
  if (svgPath) {
    svgPath.setAttribute('fill', (!colour || colour === 'none') ? '#f0f0eb' : colour);
    return;
  }

  // ── Regular SVG image panel — re-encode SVG with fill injected ──
  const imgEl = div.querySelector('.pimg');
  if (!imgEl) return;

  // Re-colour the SVG source directly — works for both filled and stroke-only shapes
  if (p.src && (p.src.startsWith('data:image/svg+xml') || p.src.startsWith('data:image/svg'))) {
    // Store original src on first call
    if (!p._origSrc) p._origSrc = p.src;
    const baseSrc = p._origSrc;
    const newSrc = (!colour || colour === 'none')
      ? baseSrc
      : svgWithFill(baseSrc, colour);
    imgEl.src = newSrc;
    // Remove any DOM overlay (not needed for SVG approach)
    const wrap = div.querySelector('.pimg-wrap');
    if (wrap) { const ov = wrap.querySelector('.fill-overlay'); if (ov) ov.remove(); }
    return;
  }

  // ── Raster image panel (PNG/JPG) — overlay colour ──
  const wrap = div.querySelector('.pimg-wrap');
  if (!wrap) return;
  let ov = wrap.querySelector('.fill-overlay');
  if (!colour || colour === 'none') {
    if (ov) ov.remove();
    return;
  }
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'fill-overlay';
    ov.style.cssText = 'position:absolute;inset:0;pointer-events:none;mix-blend-mode:multiply;opacity:0.45;border-radius:2px;';
    wrap.style.position = 'relative';
    wrap.appendChild(ov);
  }
  ov.style.background = colour;
}


// ── Export core ──────────────────────────────────
function exportWorkspace(format){
  var m=document.getElementById('export-menu');
  if(m) m.classList.remove('open');

  var penSvg=document.getElementById('pen-svg');
  var hasPen=penSvg && penSvg.querySelector('#pen-path') && penSvg.querySelector('#pen-path').getAttribute('d');
  if(!wsPanels.length && !hasPen){
    alert('Nothing on the workspace to export.\n\nAdd panels or draw with Pen first.');
    return;
  }

  var mainBtn=document.querySelector('.export-main-btn');
  if(mainBtn){mainBtn.textContent='Exporting\u2026';mainBtn.disabled=true;}
  function restore(){if(mainBtn){mainBtn.textContent='Export \u25be';mainBtn.disabled=false;}}

  var ts=new Date().toISOString().slice(0,19).replace(/[T:]/g,'-');
  var _exportFailedCount = 0;

  function dl(blob,name){
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;a.download=name;
    document.body.appendChild(a);a.click();
    document.body.removeChild(a);
    setTimeout(function(){URL.revokeObjectURL(url);},3000);
  }

  function cleanSvg(W,H){
    if(!penSvg) return null;
    var c=penSvg.cloneNode(true);
    c.setAttribute('width',W);c.setAttribute('height',H);
    ['pen-handle-lines','pen-handle-circles','pen-node-rects','pen-preview'].forEach(function(id){
      var el=c.getElementById(id);if(el)el.remove();
    });
    return c;
  }

  // ── Shared: load all panel images and resolve their natural dimensions ──
  // Returns Promise<Array<{p, img, pw, ph}>>
  // pw = rendered pixel width  = 100 * scale
  // ph = rendered pixel height = 100 * scale * (naturalH / naturalW)
  function loadPanelImages(){
    return Promise.all(wsPanels.map(function(p){
      // Merged / traced panels have no image src — supply bbox dimensions directly
      if(p.penData && p._bbox){
        return Promise.resolve({p:p, img:null, pw:p._bbox.w, ph:p._bbox.h});
      }
      return new Promise(function(res){
        var img=new Image();
        img.crossOrigin='anonymous';
        img.onload=function(){
          var pw=100*p.scale;
          var ph=(img.naturalHeight/img.naturalWidth)*pw;
          res({p:p,img:img,pw:pw,ph:ph});
        };
        img.onerror=function(){
          // Never silently drop the panel — fall back to a placeholder so
          // it's still visible (and obviously flagged) in the export rather
          // than vanishing without explanation.
          var pw=100*p.scale, ph=pw;
          res({p:p,img:null,pw:pw,ph:ph,failed:true});
        };
        // Use the DOM img src (may have fill baked in) if available
        var domImg = document.getElementById(p.id);
        var pimgEl = domImg && domImg.querySelector('.pimg');
        img.src = (pimgEl && pimgEl.src) ? pimgEl.src : p.src;
      });
    }));
  }

  function buildCanvas(){
    var W=WS_W,H=WS_H;
    _exportFailedCount = 0;
    var cv=document.createElement('canvas');
    cv.width=W;cv.height=H;
    var ctx=cv.getContext('2d');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);
    return loadPanelImages().then(function(items){
      items.forEach(function(item){
        if(!item) return;
        var p=item.p,img=item.img,pw=item.pw,ph=item.ph;

        // ── Merged / traced panel — draw path directly onto canvas ──
        if(p.penData && p._mergedD){
          var d=p._mergedD;
          var fillCol=(p.fillColor&&p.fillColor!=='none')?p.fillColor:'#f0f0eb';
          // Parse the M/L/Z path and draw using canvas API
          ctx.save();
          ctx.beginPath();
          var segs=d.trim().match(/[MLZz]([^MLZz]*)/g)||[];
          segs.forEach(function(seg){
            var cmd=seg[0];
            var coords=seg.slice(1).trim().split(/[\s,]+/).map(Number);
            if(cmd==='M') ctx.moveTo(coords[0],coords[1]);
            else if(cmd==='L'){
              for(var i=0;i<coords.length;i+=2) ctx.lineTo(coords[i],coords[i+1]);
            }
            else if(cmd==='Z'||cmd==='z') ctx.closePath();
          });
          ctx.fillStyle=fillCol;
          ctx.fill('evenodd');
          ctx.strokeStyle='#3a3a3a';
          ctx.lineWidth=1.5;
          ctx.lineJoin='round';
          ctx.stroke();
          ctx.restore();
          return;
        }

        // ── Regular image panel ──
        if(!img){
          if(item.failed){
            // Image failed to load — draw an obvious placeholder instead of
            // silently omitting the panel from the export.
            ctx.save();
            ctx.translate(p.x+pw/2, p.y+ph/2);
            ctx.rotate((p.rot||0)*Math.PI/180);
            if(p.flip)ctx.scale(-1,1);
            ctx.setLineDash([6,4]);
            ctx.strokeStyle='#d33';
            ctx.lineWidth=2;
            ctx.strokeRect(-pw/2,-ph/2,pw,ph);
            ctx.fillStyle='rgba(221,51,51,0.08)';
            ctx.fillRect(-pw/2,-ph/2,pw,ph);
            ctx.setLineDash([]);
            ctx.fillStyle='#d33';
            ctx.font='12px sans-serif';
            ctx.textAlign='center';
            ctx.fillText('image failed to load', 0, 0);
            ctx.restore();
            _exportFailedCount++;
          }
          return;
        }
        // anchor = top-left corner of the image in workspace coords
        // CSS positions p.x/p.y at the element origin (top-left of img)
        // Rotation/scale applied around that origin in the DOM, so:
        // canvas pivot = p.x + pw/2,  p.y + ph/2
        ctx.save();
        ctx.translate(p.x+pw/2, p.y+ph/2);
        ctx.rotate((p.rot||0)*Math.PI/180);
        if(p.flip)ctx.scale(-1,1);
        ctx.drawImage(img,-pw/2,-ph/2,pw,ph);
        // Draw fill colour overlay if set
        if(p.fillColor&&p.fillColor!=='none'){
          ctx.globalCompositeOperation='multiply';
          ctx.globalAlpha=0.45;
          ctx.fillStyle=p.fillColor;
          ctx.fillRect(-pw/2,-ph/2,pw,ph);
          ctx.globalAlpha=1;
          ctx.globalCompositeOperation='source-over';
        }
        ctx.restore();
      });
      return new Promise(function(res){
        var sv=cleanSvg(W,H);
        if(!sv){res(cv);return;}
        var blob=new Blob([new XMLSerializer().serializeToString(sv)],{type:'image/svg+xml;charset=utf-8'});
        var url=URL.createObjectURL(blob);
        var si=new Image();
        si.onload=function(){ctx.drawImage(si,0,0);URL.revokeObjectURL(url);res(cv);};
        si.onerror=function(){URL.revokeObjectURL(url);res(cv);};
        si.src=url;
      });
    });
  }

  // ── PNG ──
  if(format==='png'){
    buildCanvas().then(function(cv){
      cv.toBlob(function(blob){
        dl(blob,buildExportFileName('png'));
        restore();
        if(_exportFailedCount>0) alert(_exportFailedCount+' panel(s) had an image that failed to load and are marked with a red dashed placeholder in the exported PNG. Try re-applying their fill colour or re-importing the task file.');
      },'image/png');
    });

  // ── SVG — true vector export ──
  // Pen-drawn panels (p.penData) → native <path> elements reconstructed from nodes.
  // Image panels                 → <image xlink:href> with correct aspect ratio.
  // Live pen-path overlay        → extracted directly from the DOM <path id="pen-path">.
  // Canvas dimensions set in mm so Illustrator opens at exact A4.
  }else if(format==='svg'){
    // ── SVG export — Illustrator + Inkscape compatible ──
    // • NO background <rect> (causes empty bounding box in Illustrator)
    // • SVG tray panels fetched and inlined as real vector paths
    //   with CSS classes converted to presentation attributes

    function pf2(v){return parseFloat(v.toFixed(2));}

    // Rebuild cubic-bezier path `d` from stored penData (workspace coords)
    function penDataToWorkspaceD(penData){
      var nodes=penData.nodes;
      if(!nodes||nodes.length<2) return '';
      var d='M'+pf2(nodes[0].x)+','+pf2(nodes[0].y);
      for(var i=0;i<nodes.length-1;i++){
        var a=nodes[i],b=nodes[i+1];
        if(!a.handleOut&&!b.handleIn){
          d+=' L'+pf2(b.x)+','+pf2(b.y);
        } else {
          var c1x=a.handleOut?a.handleOut.x:a.x, c1y=a.handleOut?a.handleOut.y:a.y;
          var c2x=b.handleIn?b.handleIn.x:b.x,   c2y=b.handleIn?b.handleIn.y:b.y;
          d+=' C'+pf2(c1x)+','+pf2(c1y)+' '+pf2(c2x)+','+pf2(c2y)+' '+pf2(b.x)+','+pf2(b.y);
        }
      }
      if(penData.closed){
        var last=nodes[nodes.length-1],first=nodes[0];
        if(last.handleOut||first.handleIn){
          var c1x=last.handleOut?last.handleOut.x:last.x, c1y=last.handleOut?last.handleOut.y:last.y;
          var c2x=first.handleIn?first.handleIn.x:first.x,c2y=first.handleIn?first.handleIn.y:first.y;
          d+=' C'+pf2(c1x)+','+pf2(c1y)+' '+pf2(c2x)+','+pf2(c2y)+' '+pf2(first.x)+','+pf2(first.y);
        }
        d+=' Z';
      }
      return d;
    }

    // Fetch an SVG data-URI or URL and return its source text
    function fetchSvgText(url){
      if(url.startsWith('data:')){
        var comma=url.indexOf(',');
        var b64=url.slice(comma+1);
        try{ return Promise.resolve(atob(b64)); }
        catch(e){ return Promise.resolve(''); }
      }
      return fetch(url).then(function(r){return r.text();}).catch(function(){return '';});
    }

    // Parse SVG source; extract all shape elements with CSS classes
    // resolved into presentation attributes (fill=, stroke=, etc.)
    // Scales/positions shapes into destX,destY,destW,destH in workspace coords.
    function extractSvgShapes(svgText, destX, destY, destW, destH, rot, flip){
      var parser=new DOMParser();
      var doc=parser.parseFromString(svgText,'image/svg+xml');
      var svgEl=doc.querySelector('svg');
      if(!svgEl) return [];

      // Read viewBox
      var vbAttr=(svgEl.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
      var vbX=vbAttr[0]||0, vbY=vbAttr[1]||0;
      var vbW=vbAttr[2]||parseFloat(svgEl.getAttribute('width'))||100;
      var vbH=vbAttr[3]||parseFloat(svgEl.getAttribute('height'))||100;

      // Parse CSS class rules into a map
      var styleMap={};
      svgEl.querySelectorAll('style').forEach(function(s){
        var re=/\.([a-zA-Z0-9_-]+)\s*\{([^}]*)\}/g, m;
        while((m=re.exec(s.textContent))!==null){
          var rules={};
          m[2].split(';').forEach(function(rule){
            var kv=rule.split(':');
            if(kv.length===2) rules[kv[0].trim()]=kv[1].trim();
          });
          styleMap['.'+m[1]]=rules;
        }
      });

      var PATTRS=['fill','stroke','stroke-width','stroke-miterlimit',
                  'stroke-linejoin','stroke-linecap','opacity',
                  'fill-opacity','stroke-opacity'];

      function getStyle(el){
        var r={};
        (el.getAttribute('class')||'').trim().split(/\s+/).forEach(function(c){
          if(c && styleMap['.'+c]) Object.assign(r,styleMap['.'+c]);
        });
        (el.getAttribute('style')||'').split(';').forEach(function(rule){
          var kv=rule.split(':');
          if(kv.length===2) r[kv[0].trim()]=kv[1].trim();
        });
        PATTRS.forEach(function(a){
          var v=el.getAttribute(a);
          if(v!==null) r[a]=v;
        });
        return r;
      }

      function styleAttrs(obj){
        return PATTRS.filter(function(k){return obj[k]!==undefined;})
          .map(function(k){return k+'="'+obj[k]+'"';}).join(' ');
      }

      // Build transform: rotate/flip around dest centre, then place at destX,destY
      // and scale from source viewBox to destination size
      var scX=pf2(destW/vbW), scY=pf2(destH/vbH);
      var cx=pf2(destX+destW/2), cy=pf2(destY+destH/2);
      var tx='translate('+cx+','+cy+')';
      if(rot) tx+=' rotate('+rot+')';
      if(flip) tx+=' scale(-1,1)';
      tx+=' translate('+(-cx)+','+(-cy)+')'
         +' translate('+pf2(destX)+','+pf2(destY)+')'
         +' scale('+scX+','+scY+')'
         +' translate('+(-vbX)+','+(-vbY)+')';

      var out=[];
      out.push('  <g transform="'+tx+'">');
      svgEl.querySelectorAll('path,polygon,polyline,rect,circle,ellipse,line')
        .forEach(function(el){
          var tag=el.tagName.toLowerCase();
          var sa=styleAttrs(getStyle(el));
          var geom='';
          if(tag==='path'){
            geom='d="'+el.getAttribute('d')+'"';
          } else if(tag==='polygon'||tag==='polyline'){
            geom='points="'+el.getAttribute('points')+'"';
          } else if(tag==='rect'){
            ['x','y','width','height','rx','ry'].forEach(function(a){
              var v=el.getAttribute(a); if(v) geom+=' '+a+'="'+v+'"';
            });
            geom=geom.trim();
          } else if(tag==='circle'){
            ['cx','cy','r'].forEach(function(a){
              var v=el.getAttribute(a); if(v) geom+=' '+a+'="'+v+'"';
            });
            geom=geom.trim();
          } else if(tag==='ellipse'){
            ['cx','cy','rx','ry'].forEach(function(a){
              var v=el.getAttribute(a); if(v) geom+=' '+a+'="'+v+'"';
            });
            geom=geom.trim();
          } else if(tag==='line'){
            ['x1','y1','x2','y2'].forEach(function(a){
              var v=el.getAttribute(a); if(v) geom+=' '+a+'="'+v+'"';
            });
            geom=geom.trim();
          }
          if(geom) out.push('    <'+tag+' '+geom+' '+sa+'/>');
        });
      out.push('  </g>');
      return out;
    }

    // Fetch all SVG panel sources in parallel, then assemble the file
    loadPanelImages().then(function(items){
      var fetchJobs=items.map(function(item){
        if(!item||item.p.penData) return Promise.resolve(null);
        return fetchSvgText(item.p.src);
      });
      return Promise.all(fetchJobs).then(function(svgTexts){
        var lines=[];

        items.forEach(function(item,idx){
          if(!item) return;
          var p=item.p, pw=item.pw, ph=item.ph;

          if(p.penData && p.penData.isMerged){
            // Merged/traced panel — mergedD is already absolute workspace-px; no transform needed.
            var d = p.penData.mergedD;
            if(!d) return;
            lines.push('  <path d="'+d+'"'+
              ' fill="'+(p.fillColor&&p.fillColor!=='none'?p.fillColor:'#f0f0eb')+'" fill-rule="evenodd" stroke="#3a3a3a" stroke-width="2"'+
              ' stroke-linejoin="round" stroke-linecap="round"/>');

          } else if(p.penData){
            // Regular pen-drawn panel: penData.nodes store the shape's ORIGINAL
            // (creation-time) absolute coordinates. If the panel has since been
            // moved, rotated, flipped, or rescaled, those don't match its CURRENT
            // position — recompute the shape's local geometry and transform it
            // through the panel's current x/y/rot/flip/scale, baking correct
            // absolute coordinates directly into the path.
            var nodes=p.penData.nodes;
            if(!nodes || nodes.length<2) return;
            var xs2=nodes.map(function(n){return n.x;}), ys2=nodes.map(function(n){return n.y;});
            var pad2=10;
            var minX2=Math.min.apply(null,xs2)-pad2, minY2=Math.min.apply(null,ys2)-pad2;
            var vbW2=Math.max.apply(null,xs2)-Math.min.apply(null,xs2)+pad2*2;
            var vbH2=Math.max.apply(null,ys2)-Math.min.apply(null,ys2)+pad2*2;
            var sx2=pw/vbW2, sy2=ph/vbH2;
            var cosR2=Math.cos((p.rot||0)*Math.PI/180), sinR2=Math.sin((p.rot||0)*Math.PI/180);
            var flipX2=p.flip?-1:1;
            var cxWS2=p.x+pw/2, cyWS2=p.y+ph/2;
            function toCurWS(ox,oy){
              var lx=(ox-minX2)*sx2-pw/2, ly=(oy-minY2)*sy2-ph/2;
              var fx=lx*flipX2, fy=ly;
              var rx=fx*cosR2-fy*sinR2, ry=fx*sinR2+fy*cosR2;
              return pf2(cxWS2+rx)+','+pf2(cyWS2+ry);
            }
            var d=(function(){
              var out='M'+toCurWS(nodes[0].x,nodes[0].y);
              for(var i=0;i<nodes.length-1;i++){
                var a=nodes[i], b=nodes[i+1];
                if(!a.handleOut && !b.handleIn){ out+=' L'+toCurWS(b.x,b.y); }
                else {
                  var c1x=a.handleOut?a.handleOut.x:a.x, c1y=a.handleOut?a.handleOut.y:a.y;
                  var c2x=b.handleIn?b.handleIn.x:b.x,   c2y=b.handleIn?b.handleIn.y:b.y;
                  out+=' C'+toCurWS(c1x,c1y)+' '+toCurWS(c2x,c2y)+' '+toCurWS(b.x,b.y);
                }
              }
              if(p.penData.closed){
                var last=nodes[nodes.length-1], first=nodes[0];
                if(last.handleOut||first.handleIn){
                  var lc1x=last.handleOut?last.handleOut.x:last.x, lc1y=last.handleOut?last.handleOut.y:last.y;
                  var lc2x=first.handleIn?first.handleIn.x:first.x, lc2y=first.handleIn?first.handleIn.y:first.y;
                  out+=' C'+toCurWS(lc1x,lc1y)+' '+toCurWS(lc2x,lc2y)+' '+toCurWS(first.x,first.y);
                }
                out+=' Z';
              }
              return out;
            })();
            lines.push('  <path d="'+d+'"'+
              ' fill="'+(p.fillColor&&p.fillColor!=='none'?p.fillColor:'#f0f0eb')+'" stroke="#3a3a3a" stroke-width="2"'+
              ' stroke-linejoin="round" stroke-linecap="round"/>');

          } else {
            // SVG tray panel: inline as real vector (Illustrator-safe)
            var svgText=svgTexts[idx]||'';
            if(!svgText){
              // fallback rect if fetch failed
              lines.push('  <rect x="'+pf2(p.x)+'" y="'+pf2(p.y)+'"'+
                ' width="'+pf2(pw)+'" height="'+pf2(ph)+'"'+
                ' fill="none" stroke="#3a3a3a" stroke-width="1"/>');
              return;
            }
            var shapes=extractSvgShapes(svgText,p.x,p.y,pw,ph,p.rot||0,p.flip||false);
            lines=lines.concat(shapes);
          }
        });

        // In-progress live pen path (if any)
        var liveD=(document.getElementById('pen-path')||{}).getAttribute('d')||'';
        if(liveD){
          lines.push('  <path d="'+liveD+'"'+
            ' fill="none" stroke="#a06820"'+
            ' stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>');
        }

        // Final SVG — no background rect
        var svgStr='<?xml version="1.0" encoding="UTF-8"?>\n'+
          '<svg xmlns="http://www.w3.org/2000/svg" version="1.1"'+
          ' width="297mm" height="210mm"'+
          ' viewBox="0 0 '+WS_W+' '+WS_H+'">\n'+
          lines.join('\n')+'\n'+
          '</svg>';
        dl(new Blob([svgStr],{type:'image/svg+xml;charset=utf-8'}),'workspace-'+ts+'.svg');
        restore();
      });
    });


  // ── PDF (pure JS, no library) — VECTOR export: real path objects, not a bitmap ──
  }else if(format==='pdf'){
    const SCALE_MULT = 1;
    (async function(){
      function pf3(v){ return parseFloat(v.toFixed(3)); }

      // Map a point in a panel's own local/viewBox space → absolute workspace-px,
      // honouring the panel's current position, rotation, flip and displayed size.
      function panelTransformPDF(p, pw, ph, vb){
        const sx=pw/vb.w, sy=ph/vb.h;
        const cosR=Math.cos((p.rot||0)*Math.PI/180), sinR=Math.sin((p.rot||0)*Math.PI/180);
        const flipX=p.flip?-1:1;
        const cxWS=p.x+pw/2, cyWS=p.y+ph/2;
        return (vbx,vby)=>{
          const lx=(vbx-vb.x)*sx-pw/2, ly=(vby-vb.y)*sy-ph/2;
          const fx=lx*flipX, fy=ly;
          const rx=fx*cosR-fy*sinR, ry=fx*sinR+fy*cosR;
          return [cxWS+rx, cyWS+ry];
        };
      }

      // Parse an SVG path `d` (M/L/H/V/C/Z, absolute or relative) into subpaths of
      // TYPED segments — curves are kept as real cubic beziers, not flattened to
      // polylines, so the exported PDF has the same node count as the original
      // shape (Illustrator/Clo3D see clean editable curves, not hundreds of points).
      // An optional per-point transform (e.g. viewBox → workspace-px) can be applied
      // as each point is parsed.
      // Standard elliptical-arc-to-cubic-bezier conversion (SVG 'A' command).
      function arcToBezierSegs(x1,y1,rx,ry,xAxisRotDeg,largeArcFlag,sweepFlag,x2,y2){
        if (rx===0 || ry===0) return [{x1,y1,x2:x2,y2:y2,x:x2,y:y2}]; // degenerate: straight line
        rx=Math.abs(rx); ry=Math.abs(ry);
        const phi=(xAxisRotDeg%360)*Math.PI/180, cosPhi=Math.cos(phi), sinPhi=Math.sin(phi);
        const dx2=(x1-x2)/2, dy2=(y1-y2)/2;
        const x1p= cosPhi*dx2+sinPhi*dy2, y1p=-sinPhi*dx2+cosPhi*dy2;
        let rxSq=rx*rx, rySq=ry*ry; const x1pSq=x1p*x1p, y1pSq=y1p*y1p;
        const radiiCheck=x1pSq/rxSq+y1pSq/rySq;
        if (radiiCheck>1){ const s=Math.sqrt(radiiCheck); rx*=s; ry*=s; rxSq=rx*rx; rySq=ry*ry; }
        const sign=(largeArcFlag!==sweepFlag)?1:-1;
        let sq=(rxSq*rySq-rxSq*y1pSq-rySq*x1pSq)/(rxSq*y1pSq+rySq*x1pSq);
        sq=sq<0?0:sq;
        const coef=sign*Math.sqrt(sq);
        const cxp=coef*(rx*y1p/ry), cyp=coef*-(ry*x1p/rx);
        const cx=cosPhi*cxp-sinPhi*cyp+(x1+x2)/2, cy=sinPhi*cxp+cosPhi*cyp+(y1+y2)/2;
        function angle(ux,uy,vx,vy){
          const dot=ux*vx+uy*vy, len=Math.sqrt((ux*ux+uy*uy)*(vx*vx+vy*vy));
          let a=Math.acos(Math.max(-1,Math.min(1,dot/len)));
          if (ux*vy-uy*vx<0) a=-a;
          return a;
        }
        const theta1=angle(1,0,(x1p-cxp)/rx,(y1p-cyp)/ry);
        let dTheta=angle((x1p-cxp)/rx,(y1p-cyp)/ry,(-x1p-cxp)/rx,(-y1p-cyp)/ry);
        if (!sweepFlag && dTheta>0) dTheta-=2*Math.PI;
        if (sweepFlag && dTheta<0) dTheta+=2*Math.PI;
        const segments=Math.max(1,Math.ceil(Math.abs(dTheta)/(Math.PI/2)));
        const delta=dTheta/segments, t=4/3*Math.tan(delta/4);
        const out=[]; let theta=theta1;
        for (let i=0;i<segments;i++){
          const theta2=theta+delta;
          const cosT1=Math.cos(theta), sinT1=Math.sin(theta), cosT2=Math.cos(theta2), sinT2=Math.sin(theta2);
          const p1x=cx+rx*cosPhi*cosT1-ry*sinPhi*sinT1, p1y=cy+rx*sinPhi*cosT1+ry*cosPhi*sinT1;
          const p2x=cx+rx*cosPhi*cosT2-ry*sinPhi*sinT2, p2y=cy+rx*sinPhi*cosT2+ry*cosPhi*sinT2;
          const dp1x=-rx*cosPhi*sinT1-ry*sinPhi*cosT1, dp1y=-rx*sinPhi*sinT1+ry*cosPhi*cosT1;
          const dp2x=-rx*cosPhi*sinT2-ry*sinPhi*cosT2, dp2y=-rx*sinPhi*sinT2+ry*cosPhi*cosT2;
          out.push({ x1:p1x+t*dp1x, y1:p1y+t*dp1y, x2:p2x-t*dp2x, y2:p2y-t*dp2y, x:p2x, y:p2y });
          theta=theta2;
        }
        return out;
      }

      // Tokenize an 'A' command's argument string. Arc flags (large-arc, sweep)
      // are always single 0/1 digits and SVG allows them to be glued directly
      // to the next number with no separator (e.g. "30 50 0 01162 55"), so a
      // naive split-on-whitespace/comma silently corrupts every number after
      // the first glued flag — this walks the string manually instead.
      function parseArcArgs(str){
        const s=str.trim(); const out=[]; let i=0;
        function skipSep(){ while(i<s.length && /[\s,]/.test(s[i])) i++; }
        function readNumber(){
          skipSep();
          const m=/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i));
          if(!m) return null;
          i+=m[0].length; return parseFloat(m[0]);
        }
        function readFlag(){
          skipSep();
          if (i<s.length && (s[i]==='0'||s[i]==='1')){ i++; return s[i-1]==='1'?1:0; }
          return null;
        }
        while (i<s.length){
          skipSep(); if (i>=s.length) break;
          const rx=readNumber(); if(rx===null) break;
          const ry=readNumber(), xrot=readNumber(), laf=readFlag(), sf=readFlag(), x=readNumber(), y=readNumber();
          if ([ry,xrot,laf,sf,x,y].some(v=>v===null)) break;
          out.push(rx,ry,xrot,laf,sf,x,y);
        }
        return out;
      }

      function parsePathSegments(d, tf){
        tf = tf || function(x,y){ return [x,y]; };
        const subpaths=[]; let seg=[];
        let cx=0,cy=0,sx=0,sy=0;
        let prevCtrl=null; // {type:'C'|'Q', x, y} — for S/T reflection
        const cmds=(d||'').trim().match(/[MLHVCSQTAZmlhvcsqtaz][^MLHVCSQTAZmlhvcsqtaz]*/g)||[];
        for(const cmd of cmds){
          const type=cmd[0], T=type.toUpperCase(), rel=(type!==T);
          const argStr=cmd.slice(1).trim();
          const nums = T==='A' ? parseArcArgs(argStr) : argStr.split(/[\s,]+/).filter(Boolean).map(Number);
          if(T==='M'){
            if(seg.length) subpaths.push(seg);
            seg=[];
            cx = rel? cx+nums[0] : nums[0]; cy = rel? cy+nums[1] : nums[1];
            sx=cx; sy=cy;
            seg.push({ cmd:'M', pts:[tf(cx,cy)] });
            prevCtrl=null;
            for(let i=2;i<nums.length;i+=2){ cx = rel? cx+nums[i] : nums[i]; cy = rel? cy+nums[i+1] : nums[i+1]; seg.push({ cmd:'L', pts:[tf(cx,cy)] }); }
          } else if(T==='L'){
            for(let i=0;i<nums.length;i+=2){ cx = rel? cx+nums[i] : nums[i]; cy = rel? cy+nums[i+1] : nums[i+1]; seg.push({ cmd:'L', pts:[tf(cx,cy)] }); }
            prevCtrl=null;
          } else if(T==='H'){ for(const n of nums){ cx = rel? cx+n : n; seg.push({ cmd:'L', pts:[tf(cx,cy)] }); } prevCtrl=null; }
          else if(T==='V'){ for(const n of nums){ cy = rel? cy+n : n; seg.push({ cmd:'L', pts:[tf(cx,cy)] }); } prevCtrl=null; }
          else if(T==='C'){
            for(let i=0;i<nums.length;i+=6){
              const x1=rel?cx+nums[i]:nums[i],     y1=rel?cy+nums[i+1]:nums[i+1];
              const x2=rel?cx+nums[i+2]:nums[i+2], y2=rel?cy+nums[i+3]:nums[i+3];
              const ex=rel?cx+nums[i+4]:nums[i+4], ey=rel?cy+nums[i+5]:nums[i+5];
              seg.push({ cmd:'C', pts:[tf(x1,y1), tf(x2,y2), tf(ex,ey)] });
              prevCtrl={type:'C',x:x2,y:y2};
              cx=ex; cy=ey;
            }
          } else if(T==='S'){
            for(let i=0;i<nums.length;i+=4){
              const x2=rel?cx+nums[i]:nums[i], y2=rel?cy+nums[i+1]:nums[i+1];
              const ex=rel?cx+nums[i+2]:nums[i+2], ey=rel?cy+nums[i+3]:nums[i+3];
              const x1=(prevCtrl&&prevCtrl.type==='C')?2*cx-prevCtrl.x:cx;
              const y1=(prevCtrl&&prevCtrl.type==='C')?2*cy-prevCtrl.y:cy;
              seg.push({ cmd:'C', pts:[tf(x1,y1), tf(x2,y2), tf(ex,ey)] });
              prevCtrl={type:'C',x:x2,y:y2};
              cx=ex; cy=ey;
            }
          } else if(T==='Q'){
            for(let i=0;i<nums.length;i+=4){
              const qx=rel?cx+nums[i]:nums[i], qy=rel?cy+nums[i+1]:nums[i+1];
              const ex=rel?cx+nums[i+2]:nums[i+2], ey=rel?cy+nums[i+3]:nums[i+3];
              const c1x=cx+2/3*(qx-cx), c1y=cy+2/3*(qy-cy);
              const c2x=ex+2/3*(qx-ex), c2y=ey+2/3*(qy-ey);
              seg.push({ cmd:'C', pts:[tf(c1x,c1y), tf(c2x,c2y), tf(ex,ey)] });
              prevCtrl={type:'Q',x:qx,y:qy};
              cx=ex; cy=ey;
            }
          } else if(T==='T'){
            for(let i=0;i<nums.length;i+=2){
              const ex=rel?cx+nums[i]:nums[i], ey=rel?cy+nums[i+1]:nums[i+1];
              const qx=(prevCtrl&&prevCtrl.type==='Q')?2*cx-prevCtrl.x:cx;
              const qy=(prevCtrl&&prevCtrl.type==='Q')?2*cy-prevCtrl.y:cy;
              const c1x=cx+2/3*(qx-cx), c1y=cy+2/3*(qy-cy);
              const c2x=ex+2/3*(qx-ex), c2y=ey+2/3*(qy-ey);
              seg.push({ cmd:'C', pts:[tf(c1x,c1y), tf(c2x,c2y), tf(ex,ey)] });
              prevCtrl={type:'Q',x:qx,y:qy};
              cx=ex; cy=ey;
            }
          } else if(T==='A'){
            for(let i=0;i<nums.length;i+=7){
              const rx=nums[i], ry=nums[i+1], xrot=nums[i+2], laf=nums[i+3], sf=nums[i+4];
              const ex=rel?cx+nums[i+5]:nums[i+5], ey=rel?cy+nums[i+6]:nums[i+6];
              arcToBezierSegs(cx,cy,rx,ry,xrot,laf,sf,ex,ey).forEach(b=>{
                seg.push({ cmd:'C', pts:[tf(b.x1,b.y1), tf(b.x2,b.y2), tf(b.x,b.y)] });
              });
              prevCtrl=null;
              cx=ex; cy=ey;
            }
          } else if(T==='Z'){ seg.push({ cmd:'Z', pts:[] }); cx=sx; cy=sy; prevCtrl=null; }
        }
        if(seg.length) subpaths.push(seg);
        return subpaths;
      }

      function parseViewBoxPDF(svgEl){
        const vb=(svgEl.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
        return { x:vb[0]||0, y:vb[1]||0, w:vb[2]||parseFloat(svgEl.getAttribute('width')||'100'), h:vb[3]||parseFloat(svgEl.getAttribute('height')||'100') };
      }

      // ── Collect renderable shapes: {subpaths:[[{cmd,pts}],...], fill, fillRule} in workspace-px ──
      const shapes=[];
      const rasterJobs=[]; // panels whose source isn't SVG — embedded as real images instead
      let pdfSkippedCount = 0;

      for(const p of wsPanels){
        const fillCol=(p.fillColor && p.fillColor!=='none') ? p.fillColor : '#f0f0eb';

        if(p.penData && p.penData.isMerged && p.penData.mergedD){
          // Merged/traced panel — mergedD is already absolute workspace-px (may hold
          // multiple subpaths: outer boundary + holes), combined with even-odd fill.
          shapes.push({ subpaths: parsePathSegments(p.penData.mergedD), fill: fillCol, fillRule: 'evenodd' });
          continue;
        }

        const domEl = document.getElementById(p.id);
        const pimgEl = domEl && domEl.querySelector('.pimg');
        const naturalW = pimgEl ? pimgEl.naturalWidth  : 0;
        const naturalH = pimgEl ? pimgEl.naturalHeight : 0;
        const pw = Math.round(100*p.scale);
        const ph = naturalW ? pw*(naturalH/naturalW) : pw;

        if(p.penData && !p.penData.isMerged){
          // Regular pen-drawn panel — rebuild its own local viewBox from the stored
          // nodes, then map through the panel's CURRENT position/rotation/flip/scale
          // (so re-scaling or rotating a hand-drawn shape exports correctly too).
          const nodes=p.penData.nodes;
          if(!nodes || nodes.length<2) continue;
          const xs=nodes.map(n=>n.x), ys=nodes.map(n=>n.y);
          const pad=10;
          const minX=Math.min(...xs)-pad, minY=Math.min(...ys)-pad;
          const vb={ x:0, y:0, w:Math.max(...xs)-Math.min(...xs)+pad*2, h:Math.max(...ys)-Math.min(...ys)+pad*2 };
          const toWS=panelTransformPDF(p, pw, ph, vb);
          const tp=(x,y)=>{ const [wx,wy]=toWS(x-minX, y-minY); return wx.toFixed(2)+','+wy.toFixed(2); };

          let d='M'+tp(nodes[0].x,nodes[0].y);
          for(let i=0;i<nodes.length-1;i++){
            const a=nodes[i], b=nodes[i+1];
            if(!a.handleOut && !b.handleIn){ d+=' L'+tp(b.x,b.y); }
            else {
              const c1x=a.handleOut?a.handleOut.x:a.x, c1y=a.handleOut?a.handleOut.y:a.y;
              const c2x=b.handleIn?b.handleIn.x:b.x,   c2y=b.handleIn?b.handleIn.y:b.y;
              d+=' C'+tp(c1x,c1y)+' '+tp(c2x,c2y)+' '+tp(b.x,b.y);
            }
          }
          if(p.penData.closed){
            const last=nodes[nodes.length-1], first=nodes[0];
            if(last.handleOut||first.handleIn){
              const c1x=last.handleOut?last.handleOut.x:last.x, c1y=last.handleOut?last.handleOut.y:last.y;
              const c2x=first.handleIn?first.handleIn.x:first.x, c2y=first.handleIn?first.handleIn.y:first.y;
              d+=' C'+tp(c1x,c1y)+' '+tp(c2x,c2y)+' '+tp(first.x,first.y);
            }
            d+=' Z';
          }
          // d already carries workspace-px coordinates — parse with identity transform
          shapes.push({ subpaths: parsePathSegments(d), fill: fillCol, fillRule: 'nonzero' });
          continue;
        }

        // Regular tray SVG panel — fetch source, extract its shape, transform into workspace-px
        const svgText = await fetchSvgTextForTrace(p.src);
        const doc = svgText ? new DOMParser().parseFromString(svgText,'image/svg+xml') : null;
        const svgEl = doc ? doc.querySelector('svg') : null;

        if(!svgEl){
          // Not actual SVG source (e.g. a PNG/JPEG photo or scan) — embed it
          // as a real raster image in the PDF instead of dropping the panel.
          if(pimgEl && naturalW && naturalH){
            rasterJobs.push({ p, pimgEl, naturalW, naturalH, pw, ph });
          } else {
            pdfSkippedCount++;
          }
          continue;
        }
        const vb=parseViewBoxPDF(svgEl);

        // Some of these garment SVGs embed a raster photo as the real panel
        // content, with only small vector paths used for markup/overlay
        // (e.g. a highlighted marked-area rectangle). If an <image> covers a
        // substantial share of the viewBox, treat the whole panel as raster
        // — the rendered <img> already composites image + overlay correctly,
        // so use that rather than risking picking up the wrong small path.
        const imgTag = svgEl.querySelector('image');
        let treatAsRaster = false;
        if (imgTag) {
          const iw = parseFloat(imgTag.getAttribute('width')||'0'), ih = parseFloat(imgTag.getAttribute('height')||'0');
          const vbArea = vb.w*vb.h;
          if (vbArea>0 && iw*ih/vbArea > 0.3) treatAsRaster = true;
        }
        if (treatAsRaster) {
          if (pimgEl && naturalW && naturalH) rasterJobs.push({ p, pimgEl, naturalW, naturalH, pw, ph });
          else pdfSkippedCount++;
          continue;
        }

        const toWSRaw=panelTransformPDF(p, pw, ph, vb);

        const el=svgEl.querySelector('path,polygon,polyline,rect');
        if(!el){
          // No vector shape found either — never silently drop the panel;
          // fall back to embedding whatever is actually rendered on screen.
          if (pimgEl && naturalW && naturalH) rasterJobs.push({ p, pimgEl, naturalW, naturalH, pw, ph });
          else pdfSkippedCount++;
          continue;
        }
        const elMatrix = getSvgElementTransformChain(el, svgEl);
        const toWS = (x,y) => { const t = applySvgMatrix(elMatrix, x, y); return toWSRaw(t.x, t.y); };
        let subpaths=[];
        const tag=el.tagName.toLowerCase();
        if(tag==='path'){
          subpaths=parsePathSegments(el.getAttribute('d')||'', toWS);
        } else if(tag==='polygon'||tag==='polyline'){
          const nums=(el.getAttribute('points')||'').trim().split(/[\s,]+/).filter(Boolean).map(Number);
          const seg=[]; for(let i=0;i<nums.length-1;i+=2) seg.push({ cmd: i===0?'M':'L', pts:[toWS(nums[i],nums[i+1])] });
          seg.push({cmd:'Z',pts:[]});
          subpaths=[seg];
        } else if(tag==='rect'){
          const rx=parseFloat(el.getAttribute('x')||'0'), ry=parseFloat(el.getAttribute('y')||'0');
          const rw=parseFloat(el.getAttribute('width')||'0'), rh=parseFloat(el.getAttribute('height')||'0');
          subpaths=[[
            {cmd:'M',pts:[toWS(rx,ry)]}, {cmd:'L',pts:[toWS(rx+rw,ry)]},
            {cmd:'L',pts:[toWS(rx+rw,ry+rh)]}, {cmd:'L',pts:[toWS(rx,ry+rh)]}, {cmd:'Z',pts:[]}
          ]];
        }
        if(subpaths.length) shapes.push({ subpaths, fill: fillCol, fillRule: 'nonzero' });
      }

      if(!shapes.length){ alert('Nothing vector-exportable found on the workspace.'); restore(); return; }

      // ── Page sized to fit the actual content at the chosen scale — NOT a
      // fixed A4 page. Squeezing pattern pieces to fit a fixed small sheet
      // is exactly what was making them too small for Clo3D to accept. ──
      function collectWorkspaceBBox(){
        let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
        function consider(x,y){ if(Number.isFinite(x)&&Number.isFinite(y)){ if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; } }
        shapes.forEach(shape=>shape.subpaths.forEach(seg=>seg.forEach(s=>s.pts.forEach(pt=>consider(pt[0],pt[1])))));
        rasterJobs.forEach(job=>{
          const vb={x:0,y:0,w:job.naturalW,h:job.naturalH};
          const toWS=panelTransformPDF(job.p, job.pw, job.ph, vb);
          [[0,0],[vb.w,0],[0,vb.h],[vb.w,vb.h]].forEach(([lx,ly])=>{ const [wx,wy]=toWS(lx,ly); consider(wx,wy); });
        });
        return Number.isFinite(minX) ? {minX,minY,maxX,maxY} : {minX:0,minY:0,maxX:WS_W,maxY:WS_H};
      }
      const bbox = collectWorkspaceBBox();
      const MARGIN_PT = 20;
      const PT_PER_PX = 0.75 * SCALE_MULT; // 0.75pt/px = standard 96dpi baseline, times the user's chosen multiplier
      const PW = Math.max(50, (bbox.maxX-bbox.minX)*PT_PER_PX + 2*MARGIN_PT);
      const PH = Math.max(50, (bbox.maxY-bbox.minY)*PT_PER_PX + 2*MARGIN_PT);
      function toPt(x,y){ return [pf3((x-bbox.minX)*PT_PER_PX + MARGIN_PT), pf3(PH - ((y-bbox.minY)*PT_PER_PX + MARGIN_PT))]; }
      function hexToRgb01(hex){
        const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex||'');
        if(!m) return [0.94,0.94,0.92];
        return [parseInt(m[1],16)/255, parseInt(m[2],16)/255, parseInt(m[3],16)/255];
      }

      const strokeW = pf3(2*PT_PER_PX); // match the ~2px stroke used in SVG/print export, scaled with content
      let cs = 'q 1 J 1 j\n';
      function ptFinite(pt){ return pt && Number.isFinite(pt[0]) && Number.isFinite(pt[1]); }
      function segFinite(s){ return s.pts.every(ptFinite); }
      shapes.forEach(function(shape){
        // Never let a malformed/degenerate source shape write invalid (NaN)
        // operands into the PDF — that's what corrupts the file for readers
        // like Illustrator. Drop only the affected subpath(s); skip the
        // whole shape if nothing valid remains.
        const validSubpaths = shape.subpaths.filter(seg => seg.length && seg.every(segFinite));
        if (!validSubpaths.length) { pdfSkippedCount++; return; }

        const [fr,fg,fb]=hexToRgb01(shape.fill);
        cs += fr.toFixed(3)+' '+fg.toFixed(3)+' '+fb.toFixed(3)+' rg 0.227 0.227 0.227 RG '+strokeW+' w\n';
        validSubpaths.forEach(function(seg){
          seg.forEach(function(s){
            if(s.cmd==='M'){ const [x,y]=toPt(s.pts[0][0],s.pts[0][1]); cs += x+' '+y+' m\n'; }
            else if(s.cmd==='L'){ const [x,y]=toPt(s.pts[0][0],s.pts[0][1]); cs += x+' '+y+' l\n'; }
            else if(s.cmd==='C'){
              const [x1,y1]=toPt(s.pts[0][0],s.pts[0][1]);
              const [x2,y2]=toPt(s.pts[1][0],s.pts[1][1]);
              const [x3,y3]=toPt(s.pts[2][0],s.pts[2][1]);
              cs += x1+' '+y1+' '+x2+' '+y2+' '+x3+' '+y3+' c\n';
            } else if(s.cmd==='Z'){ cs += 'h\n'; }
          });
        });
        cs += (shape.fillRule==='evenodd' ? 'B*' : 'B') + '\n';
      });
      cs += 'Q';

      // ── Raster fallback images (non-SVG panel sources) — embed as real
      // PDF Image XObjects rather than dropping them. Each gets its own
      // q/Do/Q block with a placement matrix derived from three transformed
      // corner points, reusing the same panelTransformPDF+toPt pipeline
      // already validated for vector shapes.
      const rasterImages = []; // {jpegBytes, w, h, matrix:[a,b,c,d,e,f]}
      for (const job of rasterJobs) {
        try {
          const vb = { x:0, y:0, w: job.naturalW, h: job.naturalH };
          const toWS = panelTransformPDF(job.p, job.pw, job.ph, vb);
          const c00 = toPt(...toWS(0,0));            // top-left
          const c10 = toPt(...toWS(vb.w,0));          // top-right
          const c01 = toPt(...toWS(0,vb.h));          // bottom-left
          if(![c00,c10,c01].every(ptFinite)) { pdfSkippedCount++; continue; }
          const a=c10[0]-c00[0], b=c10[1]-c00[1], c=c00[0]-c01[0], d=c00[1]-c01[1], e=c01[0], f=c01[1];

          const cvs=document.createElement('canvas');
          const maxDim=1600; const scaleDown=Math.min(1, maxDim/Math.max(job.naturalW,job.naturalH));
          cvs.width=Math.max(1,Math.round(job.naturalW*scaleDown));
          cvs.height=Math.max(1,Math.round(job.naturalH*scaleDown));
          const cctx=cvs.getContext('2d');
          cctx.fillStyle='#ffffff'; cctx.fillRect(0,0,cvs.width,cvs.height);
          cctx.drawImage(job.pimgEl,0,0,cvs.width,cvs.height);

          const jpegBlob = await new Promise(res=>cvs.toBlob(res,'image/jpeg',0.88));
          if(!jpegBlob) { pdfSkippedCount++; continue; }
          const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
          rasterImages.push({ jpegBytes, w:cvs.width, h:cvs.height, matrix:[a,b,c,d,e,f] });
        } catch(err){ pdfSkippedCount++; }
      }
      let rasterCs = '';
      rasterImages.forEach(function(img, i){
        const m = img.matrix.map(v=>pf3(v));
        rasterCs += 'q '+m.join(' ')+' cm /Im'+i+' Do Q\n';
      });

      // ── Assemble a valid PDF: page + vector content + any raster image XObjects ──
      function sb(str){ const a=new Uint8Array(str.length); for(let i=0;i<str.length;i++) a[i]=str.charCodeAt(i)&0xff; return a; }
      function pad(n){ return n.toString().padStart(10,'0'); }

      const fullCs = cs + '\n' + rasterCs;

      const xobjNames = rasterImages.map((_,i)=>'/Im'+i+' '+(5+i)+' 0 R').join(' ');
      const resourcesDict = rasterImages.length ? ('<</XObject <<'+xobjNames+'>>>>') : '<<>>';

      const o1='1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n';
      const o2='2 0 obj\n<</Type /Pages /Kids [3 0 R] /Count 1>>\nendobj\n';
      const o3='3 0 obj\n<</Type /Page /Parent 2 0 R /MediaBox [0 0 '+PW.toFixed(2)+' '+PH.toFixed(2)+'] /Contents 4 0 R /Resources '+resourcesDict+'>>\nendobj\n';
      const o4='4 0 obj\n<</Length '+fullCs.length+'>>\nstream\n'+fullCs+'\nendstream\nendobj\n';

      const hdrB=sb('%PDF-1.4\n'), o1B=sb(o1), o2B=sb(o2), o3B=sb(o3), o4B=sb(o4);

      // Each raster image is its own indirect object (5, 6, 7, ...), containing
      // the raw JPEG bytes directly (DCTDecode — PDF readers decode JPEG natively).
      const imgObjBlobs = rasterImages.map(function(img, i){
        const head = (5+i)+' 0 obj\n<</Type /XObject /Subtype /Image /Width '+img.w+' /Height '+img.h+
          ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+img.jpegBytes.length+'>>\nstream\n';
        const headB = sb(head), tailB = sb('\nendstream\nendobj\n');
        const combined = new Uint8Array(headB.length + img.jpegBytes.length + tailB.length);
        combined.set(headB,0); combined.set(img.jpegBytes,headB.length); combined.set(tailB,headB.length+img.jpegBytes.length);
        return combined;
      });

      const allObjB = [o1B,o2B,o3B,o4B,...imgObjBlobs];
      const offsets = [];
      let running = hdrB.length;
      allObjB.forEach(b => { offsets.push(running); running += b.length; });
      const xrefOff = running;

      const totalObjs = allObjB.length + 1; // +1 for the free-list head entry
      let xrefStr = 'xref\n0 '+totalObjs+'\n0000000000 65535 f \n';
      offsets.forEach(off => { xrefStr += pad(off)+' 00000 n \n'; });
      xrefStr += 'trailer\n<</Size '+totalObjs+' /Root 1 0 R>>\nstartxref\n'+xrefOff+'\n%%EOF\n';
      const xrefB=sb(xrefStr);

      const total=hdrB.length+allObjB.reduce((s,b)=>s+b.length,0)+xrefB.length;
      const out=new Uint8Array(total);
      let pos=0;
      out.set(hdrB,pos); pos+=hdrB.length;
      allObjB.forEach(b=>{ out.set(b,pos); pos+=b.length; });
      out.set(xrefB,pos);

      dl(new Blob([out],{type:'application/pdf'}),buildExportFileName('pdf'));
      restore();
      if (pdfSkippedCount > 0) alert(pdfSkippedCount+' panel(s) had invalid/degenerate source geometry and were left out of the PDF (the rest exported normally). Try re-tracing or re-importing those specific panels.');
    })().catch(function(err){ console.error(err); alert('PDF export failed: '+(err&&err.message||err)); restore(); });
  }
}

// Icons are rendered as soon as the CDN script's onload fires (see <head>),
// plus once more at the end of _wireListeners() above as a fallback (called
// from mount(), since [data-lucide] elements don't exist until then). If
// neither has run yet (still loading), retry briefly rather than leaving
// icons blank/half-rendered.
function ensureIconsRendered(attempt){
  attempt = attempt || 0;
  if (window.lucide) { lucide.createIcons(); return; }
  if (attempt < 20) setTimeout(() => ensureIconsRendered(attempt+1), 150);
}

// ════════════════════════════════════════
//  NATIVE INTEGRATION — PUBLIC API
//  Replaces the old postMessage protocol (flatform_task_transfer,
//  flatform_state_request/restore, flatform_results_transfer) now that
//  Panel Studio is mounted natively inside the participant workspace
//  instead of living behind an <iframe> boundary.
// ════════════════════════════════════════
var _mounted = false;
var _onCompleteCallbacks = [];
function _fireComplete(snapshot, stage){
  _onCompleteCallbacks.forEach(function(cb){ try{ cb(snapshot, stage); }catch(err){ console.error(err); } });
}
function onComplete(cb){ if(typeof cb === 'function') _onCompleteCallbacks.push(cb); }

var _onBackCallbacks = [];
function onBack(cb){ if(typeof cb === 'function') _onBackCallbacks.push(cb); }
function _goBack(){ _onBackCallbacks.forEach(function(cb){ try{ cb(); }catch(err){ console.error(err); } }); }

// ── Read-only review mode — called by Participant when it opens an
// already-completed stage's Studio for viewing rather than editing.
// opts.completedLabel (string) replaces the live countdown timer with a
// fixed, informational line ("Completed in 18 min 42 sec") built by
// Participant from its own PKG.lifecycleLog — Panel Studio itself never
// reads PKG, it just displays whatever string it's given (see §4 API
// principle: Panel Studio only reacts to defined calls, never reaches into
// Participant's data). Editing is disabled via a CSS hook (.ps-readonly,
// see panel-studio-module.css) plus defence-in-depth guards at the handful
// of real mutation entry points (onWorkspaceMouseDown, freehandPointerDown,
// onKeyDown, onGarmentOverlayClick) — Export (PDF/PNG) and Print stay live
// throughout, marked by the .ws-btn-export class in getMarkup() above. ──
function setReadOnly(ro, opts){
  psReadOnly = !!ro;
  psCompletedLabel = (opts && opts.completedLabel) || '';
  const root = document.getElementById('screen-workshop');
  if(root) root.classList.toggle('ps-readonly', psReadOnly);
  const finishBtn = document.getElementById('ps-finish-btn');
  const backBtn = document.getElementById('ps-back-btn');
  if(finishBtn) finishBtn.style.display = psReadOnly ? 'none' : '';
  if(backBtn) backBtn.style.display = psReadOnly ? '' : 'none';
  const tEl = document.getElementById('ps-timer');
  if(tEl && psReadOnly) tEl.textContent = psCompletedLabel || 'Completed';
}

// Shared filename base for Studio-originated exports — same convention as
// Console's package export / Participant's "-Solution" save filenames
// (<participant id> - <stage> - <date> - <time AM/PM> - <export id>), built
// here purely from what Participant already passes into applyTaskFile()
// (t.participantCode, t.stage, t.exportId) — no PKG access needed.
function buildExportFileName(ext){
  const t = currentTaskMeta || {};
  const STAGE_LABEL = {pretest:'Pretest', s1:'Stage1', s2:'Stage2', s3:'Stage3', posttest:'Posttest'};
  const stageLabel = STAGE_LABEL[t.stage] || (t.stage || 'stage');
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  let h = now.getHours(); const ampm = h>=12?'PM':'AM'; h = h%12; if(h===0) h=12;
  const time = `${String(h).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${ampm}`;
  const pid = (t.participantCode || 'participant').replace(/\s+/g,'-');
  const xid = t.exportId || 'EXP';
  return `${pid} - ${stageLabel} - ${date} - ${time} - ${xid}.${ext}`;
}
function restoreState(project){
  if(!project) return;
  try {
    wsPanels = project.wsPanels || [];
    if (project.selectedGarment) selectedGarment = project.selectedGarment;
    rerenderAllPanelsFromState();
  } catch(err){ console.error(err); }
}
function mount(containerEl){
  if(_mounted || !containerEl) return;
  containerEl.innerHTML = getMarkup();
  _wireListeners(); // also renders lucide icons + the template thumbnail — see its tail
  _mounted = true;
}
function isMounted(){ return _mounted; }

// A handful of internal functions are still referenced by bare name from
// inline onclick/onchange attributes inside this module's own markup
// (getMarkup() above) — expose exactly those on window so they keep
// resolving now that the rest of this file's declarations are scoped
// inside the PanelStudio closure rather than being true globals.
window._closeTaskModal = _closeTaskModal;
window._confirmComplete = _confirmComplete;
window._goBack = _goBack;
window.applyFillColor = applyFillColor;
window.clearWorkspace = clearWorkspace;
window.closeMannequin = closeMannequin;
window.closeTraceOverlay = closeTraceOverlay;
window.duplicateSelectedPanels = duplicateSelectedPanels;
window.exportWorkspace = exportWorkspace;
window.fillSelectedPanels = fillSelectedPanels;
window.flipSelectedPanels = flipSelectedPanels;
window.flipWS = flipWS;
window.handleTaskFileInput = handleTaskFileInput;
window.deleteSelectedPanels = deleteSelectedPanels;
window.moveAllTrayPanelsToWorkspace = moveAllTrayPanelsToWorkspace;
window.mergeSelectedPanels = mergeSelectedPanels;
window.performRedo = performRedo;
window.performUndo = performUndo;
window.printWorkspace = printWorkspace;
window.rmWS = rmWS;
window.rotateMQ = rotateMQ;
window.rotateSelectedPanels = rotateSelectedPanels;
window.showCompleteModal = showCompleteModal;
window.startWorkshop = startWorkshop;
window.toggleAutoSpin = toggleAutoSpin;
window.toggleColorPopover = toggleColorPopover;
window.toggleFreehandMode = toggleFreehandMode;
window.toggleGarmentOverlay = toggleGarmentOverlay;
window.toggleGridOverlay = toggleGridOverlay;
window.toggleLeftPanel = toggleLeftPanel;
window.toggleMarginGuide = toggleMarginGuide;
window.togglePenMode = togglePenMode;
window.toggleSelectMoveMode = toggleSelectMoveMode;
window._onReferenceTabClick = _onReferenceTabClick;
window.toggleTemplateOverlay = toggleTemplateOverlay;
window.traceSelectedPanels = traceSelectedPanels;

return { mount, applyTaskFile, buildStateSnapshot, restoreState, onComplete, isMounted, setReadOnly, onBack, setReferenceUnlockState, onReferenceEvent };
})();
