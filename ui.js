// --- UI State & Logic ---
// このファイルはUIの操作、イベントハンドリング、DOMの更新を担当します。
// 計算ロジックは含みません。

const displayArea = document.getElementById('display-area');
const display = document.getElementById('display');
const subDisplayContainer = document.getElementById('sub-display-container');
const subDisplayContent = document.getElementById('sub-display-content');
const scrollIndicator = document.getElementById('scroll-indicator');
const scrollUpIndicator = document.getElementById('scroll-up-indicator');
const scrollDownIndicator = document.getElementById('scroll-down-indicator');
const lockIcon = document.getElementById('lock-icon');
const unlockIcon = document.getElementById('unlock-icon');
const modeSwitchLabels = document.querySelectorAll('.mode-switch-label');

let expression = '0';
let cursorPosition = 1;
let insertMode = true;
let isFunctionResultDisplayed = false;
let memoryValue = 0;
let lastAns = 0;
let isSizeLocked = false;
let subDisplayMessageTimeout;
let currentMode = '2020'; // '1989' or '2020'

// ★★★ 重要 ★★★
// Renderにデプロイした後、バックエンドサーバーのURLをここに設定してください。
const BACKEND_URL = 'https://pkun-backend.onrender.com'; // 例: 'https://your-app-name.onrender.com'

// Sub-display scroll state
let subDisplayScrollTop = 0;
const SUB_DISPLAY_LINE_HEIGHT = 25.2;

// --- Core Display Functions ---
function formatNumberString(str) {
    const parts = str.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
}

function formatExpressionForDisplay(expr) {
    return expr.split(/(\s[+\-×÷]\s)/g).map(part => {
        if (!isNaN(parseFloat(part)) && !part.includes('e')) {
            return formatNumberString(part);
        }
        return part;
    }).join('');
}

function updateSubDisplay(text, temporary = false) {
    clearTimeout(subDisplayMessageTimeout);
    subDisplayContent.textContent = text;
    if (temporary) {
        const previousText = isFunctionResultDisplayed ? subDisplayContent.textContent : expression;
        subDisplayMessageTimeout = setTimeout(() => {
            if (subDisplayContent.textContent === text) {
                subDisplayContent.textContent = isFunctionResultDisplayed ? previousText : expression;
            }
        }, 1500);
    }
}

function renderDisplayWithCursor() {
    const formattedExpression = formatExpressionForDisplay(expression);
    const displayLength = formattedExpression.length;
    
    display.classList.remove('text-5xl', 'text-4xl', 'text-3xl');
    if (displayLength > 15) {
        display.classList.add('text-3xl');
    } else if (displayLength > 11) {
        display.classList.add('text-4xl');
    } else {
        display.classList.add('text-5xl');
    }

    if (isFunctionResultDisplayed) {
        display.innerHTML = '<span class="cursor">0</span>';
        return;
    }
    
    const originalLength = expression.substring(0, cursorPosition).replace(/,/g, '').length;
    let displayCursorPos = 0;
    let realCharCount = 0;
    for (let i = 0; i < formattedExpression.length; i++) {
        if (formattedExpression[i] !== ',') {
            realCharCount++;
        }
        if (realCharCount === originalLength) {
            displayCursorPos = i + 1;
            break;
        }
    }
    if (realCharCount < originalLength) displayCursorPos = formattedExpression.length;

    const left = formattedExpression.substring(0, displayCursorPos);
    let cursorChar = formattedExpression.substring(displayCursorPos, displayCursorPos + 1) || '&nbsp;';
    const right = formattedExpression.substring(displayCursorPos + 1);
    display.innerHTML = `${left}<span class="cursor">${cursorChar}</span>${right}`;
}

// --- Unified Input Handler ---
function insertCharacter(char) {
    if (isFunctionResultDisplayed) clearDisplay('all');
    if (expression === '0' && char !== '.') {
        expression = '';
        cursorPosition = 0;
    }

    const currentNumber = expression.split(/[\s+\-×÷]/).pop();
    if (char.match(/[0-9]/) && currentNumber.replace('.', '').length >= 15) {
        return;
    }

    const left = expression.substring(0, cursorPosition);
    const right = insertMode ? expression.substring(cursorPosition) : expression.substring(cursorPosition + 1);
    expression = left + char + right;
    cursorPosition += char.length;
    renderDisplayWithCursor();
    updateSubDisplay(expression);
}

// --- Key Press Handlers ---
function pressKey(key) {
    if (key === 'ANS') insertCharacter(String(lastAns));
    else insertCharacter(key);
}

function pressOperator(op) {
    insertCharacter(` ${op} `);
}

function calculate() {
    try {
        let evalExpression = expression.replace(/,/g, '').replace(/÷/g, '/').replace(/×/g, '*');
        if (/[^0-9\.\+\-\*\/\(\)\s]/.test(evalExpression)) throw new Error("無効な文字");
        
        let result = new Function('return ' + evalExpression)();
        lastAns = result;
        updateSubDisplay(expression + ' =');
        
        const resultStr = String(result);
        if (resultStr.replace(/[\.-]/g, '').length > 15 || Math.abs(result) > 1e15 || (Math.abs(result) < 1e-9 && result !== 0) ) {
            expression = result.toExponential(9);
        } else {
            expression = resultStr;
        }
        cursorPosition = expression.length;
        renderDisplayWithCursor();
    } catch (e) {
        updateSubDisplay('式エラー');
    }
}

function clearDisplay(type) {
    if (type === 'all' || isFunctionResultDisplayed) {
        expression = '0';
        cursorPosition = 1;
        isFunctionResultDisplayed = false;
        displayArea.classList.remove('function-result-mode');
        updateSubDisplay('');
        scrollIndicator.classList.add('hidden');
        subDisplayContent.textContent = '';
    } else {
        if (cursorPosition > 0) {
            const left = expression.substring(0, cursorPosition - 1);
            const right = expression.substring(cursorPosition);
            expression = left + right;
            cursorPosition--;
        }
        if (expression === '') {
            expression = '0';
            cursorPosition = 1;
        }
    }
    renderDisplayWithCursor();
    if(!isFunctionResultDisplayed) updateSubDisplay(expression);
}

function moveCursor(direction) {
    if (isFunctionResultDisplayed) {
        const maxScroll = Math.max(0, subDisplayContent.scrollHeight - subDisplayContainer.clientHeight);
        if (direction === 'right') { // Scroll Down
            subDisplayScrollTop = Math.min(subDisplayScrollTop + SUB_DISPLAY_LINE_HEIGHT, maxScroll);
        } else { // Scroll Up
            subDisplayScrollTop = Math.max(0, subDisplayScrollTop - SUB_DISPLAY_LINE_HEIGHT);
        }
        updateSubDisplayScroll();
    } else {
        if (direction === 'left') {
            cursorPosition = Math.max(0, cursorPosition - 1);
        } else {
            cursorPosition = Math.min(expression.length, cursorPosition + 1);
        }
        renderDisplayWithCursor();
    }
}

function toggleInsertMode() {
    insertMode = !insertMode;
    updateSubDisplay(insertMode ? 'INS' : 'OVR', true);
}

function pressMemory(type) {
    let currentValue;
    try {
        currentValue = new Function('return ' + expression.replace(/,/g, '').replace(/÷/g, '/').replace(/×/g, '*'))();
    } catch(e) { currentValue = NaN; }

    switch (type) {
        case 'MC': memoryValue = 0; updateSubDisplay('メモリークリア', true); break;
        case 'MR': expression = String(memoryValue); cursorPosition = expression.length; renderDisplayWithCursor(); updateSubDisplay(expression); break;
        case 'M+': if (!isNaN(currentValue)) { memoryValue += currentValue; updateSubDisplay(`${currentValue} を加算`, true); } break;
        case 'M-': if (!isNaN(currentValue)) { memoryValue -= currentValue; updateSubDisplay(`${currentValue} を減算`, true); } break;
    }
}

// --- Mode Switch Logic ---
function handleModeChange(mode) {
    currentMode = mode;
    // Update active label style
    modeSwitchLabels.forEach(label => {
        label.classList.toggle('active', label.htmlFor === `mode-${mode}`);
    });
    // Disable/enable new feature buttons
    document.querySelectorAll('.new-feature').forEach(button => {
        button.disabled = (mode === '1989');
    });
    updateSubDisplay(`モード切替: ${mode === '1989' ? '1989 空圧先生' : '2020 最新理論'}`, true);
}

// --- Modal Control & Logic ---
function openModal(modalId) {
    const modal = document.getElementById(`modal-${modalId}`);
    if (modal) {
        updateModalUIForMode(modalId);
        modal.classList.remove('hidden');
        const content = modal.querySelector('.modal-content');
        setTimeout(() => {
            modal.style.opacity = 1;
            content.style.opacity = 1;
            content.style.transform = 'translateY(0) scale(1)';
        }, 10);
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(`modal-${modalId}`);
    if (modal) {
        const content = modal.querySelector('.modal-content');
        modal.style.opacity = 0;
        content.style.opacity = 0;
        content.style.transform = 'translateY(20px) scale(0.95)';
        setTimeout(() => modal.classList.add('hidden'), 200);
    }
}

function toggleVis(element, condition) {
    if (element) {
        element.classList.toggle('hidden', !condition);
    }
}

async function executeCalculation(functionId) {
    // Wrap entire function in try...catch for better error reporting
    try {
        const form = document.getElementById(`form-${functionId}`);
        if (!form) {
            throw new Error(`UI Error: Form 'form-${functionId}' not found.`);
        }
        
        const formData = new FormData(form);
        const params = {};
        for (let [key, value] of formData.entries()) {
            params[key] = value;
        }

        // --- Pressure Conversion Logic ---
        const MPA_TO_KGF = 10.19716;
        const KGF_TO_MPA = 0.0980665;
        const pressureFields = [
            'pressure', 'p1', 'p2', 'p1_bleed', 'supply_pressure', 
            'target_pressure', 'initial_pressure', 'p1_2020', 'p2_2020'
        ];

        if (currentMode === '1989') {
            // Backend expects kgf/cm². Convert if unit is MPa.
            pressureFields.forEach(field => {
                const unitField = `${field}_unit`;
                if (params[field] && params[unitField] === 'MPa') {
                    params[field] = (parseFloat(params[field]) * MPA_TO_KGF).toString();
                }
            });
        } else { // currentMode === '2020'
            // Backend expects MPa. Convert if unit is K/C.
            pressureFields.forEach(field => {
                const unitField = `${field}_unit`;
                if (params[field] && params[unitField] === 'K/C') {
                    params[field] = (parseFloat(params[field]) * KGF_TO_MPA).toString();
                }
            });
        }

        if (functionId === 'P3') {
            params.cylinders = [];
            const cylinderGroups = form.querySelectorAll('.cylinder-group');
            cylinderGroups.forEach(group => {
                params.cylinders.push({
                    diameter: group.querySelector('[name=diameter]').value,
                    stroke: group.querySelector('[name=stroke]').value,
                    frequency: group.querySelector('[name=frequency]').value,
                    pipe_length: group.querySelector('[name=pipe_length]').value,
                    pipe_diameter: group.querySelector('[name=pipe_diameter]').value,
                });
            });
        }
        
        updateSubDisplay('計算中...', true);
        console.log(`Sending request to backend. Mode: ${currentMode}, Function: ${functionId}`, params);

        const response = await fetch(`${BACKEND_URL}/calculate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ functionId, calculationMode: currentMode, params }),
        });

        if (!response.ok) {
            const errText = await response.text();
            try {
                const errJson = JSON.parse(errText);
                throw new Error(errJson.error || `サーバーエラー: ${response.status}`);
            } catch {
                throw new Error(`サーバー応答エラー: ${response.status} - ${errText}`);
            }
        }

        const result = await response.json();
        displayCalculationResult(functionId, result);
        closeModal(functionId);

    } catch (e) {
        console.error(`Calculation Error in ${functionId} (${currentMode} mode):`, e);
        let errorMessage = "計算エラー: ";
        if (e instanceof TypeError && e.message.includes('Failed to fetch')) {
            errorMessage += "サーバーに接続できません。URLまたはネットワークを確認してください。";
        } else {
            errorMessage += e.message;
        }
        updateSubDisplay(errorMessage, true);
    }
}

function displayCalculationResult(functionId, data) {
    clearDisplay('all');
    displayArea.classList.add('function-result-mode');
    const resultText = Object.entries(data).map(([key, value]) => `${key}: ${value}`).join('\n');
    
    subDisplayContent.textContent = resultText;
    subDisplayContent.style.transform = `translateY(0px)`;
    subDisplayScrollTop = 0;

    requestAnimationFrame(() => {
        const containerHeight = subDisplayContainer.clientHeight;
        const contentHeight = subDisplayContent.scrollHeight;
        
        if (contentHeight > containerHeight) {
            scrollIndicator.classList.remove('hidden');
            updateSubDisplayScroll();
        } else {
            scrollIndicator.classList.add('hidden');
        }
    });
    
    isFunctionResultDisplayed = true;
    renderDisplayWithCursor();
}

function updateSubDisplayScroll() {
    subDisplayContent.style.transform = `translateY(-${subDisplayScrollTop}px)`;
    scrollUpIndicator.style.visibility = subDisplayScrollTop > 0 ? 'visible' : 'hidden';
    const maxScroll = Math.max(0, subDisplayContent.scrollHeight - subDisplayContainer.clientHeight);
    scrollDownIndicator.style.visibility = subDisplayScrollTop < maxScroll ? 'visible' : 'hidden';
}

function createPressureInput(name, label, defaultValue, unitName, mode) {
    const is1989 = mode === '1989';
    const KGF_TO_MPA = 0.0980665;
    const defaultVal = is1989 ? (defaultValue / KGF_TO_MPA).toFixed(2) : defaultValue.toFixed(2);
    const defaultUnit = is1989 ? 'K/C' : 'MPa';

    return `
        <div class="input-group">
            <label class="input-label">${label}</label>
            <div class="flex items-center mt-1">
                <input type="number" name="${name}" class="input-field flex-grow" value="${defaultVal}" step="any">
                <div class="text-xs pl-2 flex-shrink-0 space-y-1">
                    <label class="flex items-center"><input type="radio" name="${unitName}" value="MPa" ${defaultUnit === 'MPa' ? 'checked' : ''}> <span class="pl-1">MPa</span></label>
                    <label class="flex items-center"><input type="radio" name="${unitName}" value="K/C" ${defaultUnit === 'K/C' ? 'checked' : ''}> <span class="pl-1">kgf/cm²</span></label>
                </div>
            </div>
        </div>
    `;
}

// --- Modal Creation & UI Update ---
function createAllModals() {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
        ${createModal('P0', 'シリンダ出力と負荷率', `
            <div data-change-handler="toggleP0">
                <label class="flex items-center"><input type="radio" name="type" value="output" checked><span class="ml-2">出力のみ</span></label>
                <label class="flex items-center"><input type="radio" name="type" value="load_rate"><span class="ml-2">負荷率も計算</span></label>
            </div>
            <hr class="my-2">
            <div class="pressure-input-p0"></div>
            <div class="input-group"><label class="input-label">シリンダ内径 (mm)</label><input type="number" name="cylinder_diameter" class="input-field" value="63"></div>
            <div class="input-group"><label class="input-label">ロッド径 (mm)</label><input type="number" name="rod_diameter" class="input-field" value="24"></div>
            <hr class="my-2">
            <div class="input-group">
                <label class="input-label">出力単位</label>
                <div class="flex items-center space-x-4 mt-1">
                    <label class="flex items-center"><input type="radio" name="output_unit" value="N" checked><span class="ml-2">N (ニュートン)</span></label>
                    <label class="flex items-center"><input type="radio" name="output_unit" value="KGF"><span class="ml-2">kgf (重量キログラム)</span></label>
                </div>
            </div>
            <div id="p0-load-inputs" class="space-y-3 pl-5 hidden">
                <div class="input-group"><label class="input-label load-weight-label">負荷の重量</label><input type="number" name="load_weight" class="input-field" value="1960"></div>
                <div class="input-group"><label class="input-label">摩擦係数</label><input type="number" name="load_friction" class="input-field" value="0.3"></div>
            </div>
        `)}
        ${createModal('P1', '運動（動作時間・必要流量特性）', `
            <div data-change-handler="toggleP1">
                <label class="flex items-center"><input type="radio" name="type" value="time" checked><span class="ml-2">動作時間を計算</span></label>
                <label class="flex items-center" id="p1-type-label-s"><input type="radio" name="type" value="necessary_s"><span class="ml-2"></span></label>
            </div>
            <div>
                <label class="flex items-center"><input type="radio" name="direction" value="push" checked><span class="ml-2">PUSH</span></label>
                <label class="flex items-center"><input type="radio" name="direction" value="pull"><span class="ml-2">PULL</span></label>
            </div>
            <hr class="my-2">
            <div id="p1-time-inputs">
                 <div class="mode-1989 hidden"><div class="input-group"><label class="input-label">合成有効断面積S (mm²)</label><input type="number" name="s_composite" class="input-field" value="5.68"></div></div>
                 <div class="mode-2020 hidden"><div class="input-group"><label class="input-label">音速コンダクタンスC (L/(s·bar))</label><input type="number" name="c_conductance" class="input-field" value="1.2"></div></div>
            </div>
            <div id="p1-s-inputs" class="hidden">
                <div class="input-group"><label class="input-label">目標動作時間 (s)</label><input type="number" name="time" class="input-field" value="0.8"></div>
            </div>
            <div class="pressure-input-p1"></div>
            <div class="input-group"><label class="input-label">シリンダ内径 (mm)</label><input type="number" name="cylinder_diameter" class="input-field" value="50"></div>
            <div class="input-group"><label class="input-label">ロッド径 (mm)</label><input type="number" name="rod_diameter" class="input-field" value="20"></div>
            <div class="input-group"><label class="input-label">ストローク (mm)</label><input type="number" name="stroke" class="input-field" value="300"></div>
            <div class="input-group"><label class="input-label load-weight-label">負荷重量</label><input type="number" name="load_weight" class="input-field" value="480"></div>
            <div class="input-group"><label class="input-label">摩擦係数</label><input type="number" name="load_friction" class="input-field" value="0.4"></div>
        `)}
         ${createModal('P2', '流量特性', `
            <div data-change-handler="toggleP2">
                <label class="flex items-center"><input type="radio" name="type" value="pipe" checked><span class="ml-2">配管の流量特性</span></label>
                <label class="flex items-center"><input type="radio" name="type" value="composite"><span class="ml-2">流量特性の合成</span></label>
            </div>
            <hr class="my-2">
            <div id="p2-pipe-inputs">
                <div class="input-group"><label class="input-label">配管長さ (m)</label><input type="number" name="pipe_length" class="input-field" value="3"></div>
                <div class="input-group"><label class="input-label">配管種類</label><select name="pipe_type" class="input-field"><option value="steel">鋼管</option><option value="nylon">ナイロンチューブ</option></select></div>
                <div class="input-group"><label class="input-label">配管内径 (mm)</label><input type="number" name="pipe_diameter" class="input-field" value="16.1"></div>
            </div>
            <div id="p2-composite-inputs" class="hidden">
                 <div class="mode-1989 hidden"><div class="input-group"><label class="input-label">各有効断面積S (カンマ区切り)</label><input type="text" name="s_values" class="input-field" value="15,8,20"></div></div>
                 <div class="mode-2020 hidden"><div class="input-group"><label class="input-label">各C,b値 (例: 1.2,0.3; 1.5,0.5)</label><input type="text" name="cb_values" class="input-field" value="1.2,0.3;1.5,0.5"></div></div>
            </div>
        `)}
        ${createModal('P3', '空気消費量', `
            <div class="pressure-input-p3"></div>
            <div class="input-group"><label class="input-label">シリンダの本数</label><input type="number" name="num_cylinders" class="input-field" value="2" data-change-handler="generateCylinders"></div>
            <div id="p3-cylinder-inputs" class="space-y-4"></div>
        `)}
        ${createModal('P4', '流量', `
            <div class="mode-1989 hidden">
                <div data-change-handler="toggleP4">
                    <label class="flex items-center"><input type="radio" name="type_1989" value="flow" checked><span class="ml-2">流量</span></label>
                    <label class="flex items-center"><input type="radio" name="type_1989" value="bleed"><span class="ml-2">ブリード量</span></label>
                </div>
                <hr class="my-2">
                <div id="p4-flow-inputs-1989">
                    <div class="pressure-input-p4-p1-1989"></div>
                    <div class="pressure-input-p4-p2-1989"></div>
                    <div class="input-group"><label class="input-label">絞り部のS (mm²)</label><input type="number" name="s_1989" class="input-field" value="10"></div>
                </div>
                <div id="p4-bleed-inputs-1989" class="hidden">
                    <div class="pressure-input-p4-p1bleed-1989"></div>
                    <div class="input-group"><label class="input-label">ノズル内径 (mm)</label><input type="number" name="nozzle_diameter_1989" class="input-field" value="0.8"></div>
                </div>
            </div>
            <div class="mode-2020 hidden">
                 <div class="pressure-input-p4-p1-2020"></div>
                 <div class="pressure-input-p4-p2-2020"></div>
                 <div class="input-group"><label class="input-label">音速コンダクタンスC</label><input type="number" name="c_conductance_2020" class="input-field" value="2.0"></div>
                 <div class="input-group"><label class="input-label">臨界圧力比b</label><input type="number" name="b_ratio_2020" class="input-field" value="0.3"></div>
            </div>
        `)}
        ${createModal('P5', '三角関数', `
            <div class="input-group"><label class="input-label">関数</label><select name="func" class="input-field"><option value="sin">sin</option><option value="cos">cos</option><option value="tan">tan</option><option value="asin">asin</option><option value="acos">acos</option><option value="atan">atan</option></select></div>
            <div class="input-group"><label class="input-label">値 (角度 or -1~1)</label><input type="number" name="value" class="input-field" value="40"></div>
        `)}
        ${createModal('P6', '対数', `
            <div class="input-group"><label class="input-label">関数</label><select name="func" class="input-field"><option value="log10">log10</option><option value="loge">loge</option></select></div>
            <div class="input-group"><label class="input-label">値</label><input type="number" name="value" class="input-field" value="5230"></div>
        `)}
        ${createModal('SP2', '配管の圧力損失', `
            <div class="pressure-input-sp2"></div>
            <div class="input-group"><label class="input-label">流量 (L/min)</label><input type="number" name="flow" class="input-field" value="5000"></div>
            <div class="input-group"><label class="input-label">配管長さ (m)</label><input type="number" name="length" class="input-field" value="30"></div>
            <div class="input-group"><label class="input-label">配管内径 (mm)</label><input type="number" name="diameter" class="input-field" value="27.6"></div>
        `)}
        ${createModal('SP3', 'タンクへの空気圧の充填', `
            <div data-change-handler="toggleSP3">
                <label><input type="radio" name="type" value="fill_time_full" checked> 充填完了時間</label><br>
                <label><input type="radio" name="type" value="fill_time_to_p"> Pまで上昇する時間</label><br>
                <label><input type="radio" name="type" value="pressure_after_t"> T秒後の圧力</label>
            </div>
            <hr class="my-2">
            <div class="pressure-input-sp3-supply"></div>
            <div class="input-group"><label class="input-label">タンク容積 (L)</label><input type="number" name="volume" class="input-field" value="20"></div>
            <div class="mode-1989 hidden"><div class="input-group"><label class="input-label">絞り部のS (mm²)</label><input type="number" name="s" class="input-field" value="12"></div></div>
            <div class="mode-2020 hidden"><div class="input-group"><label class="input-label">回路のC (L/(s·bar))</label><input type="number" name="c_conductance_sp3" class="input-field" value="2.5"></div></div>
            <div id="sp3-p-input" class="hidden"><div class="pressure-input-sp3-target"></div></div>
            <div id="sp3-t-input" class="hidden"><div class="input-group"><label class="input-label">充填時間 T (s)</label><input type="number" name="fill_time" class="input-field" value="3"></div></div>
        `)}
        ${createModal('SP4', 'タンクからの空気圧の放出', `
             <div data-change-handler="toggleSP4">
                <label><input type="radio" name="type" value="release_time_full" checked> 放出完了時間</label><br>
                <label><input type="radio" name="type" value="release_time_to_p"> Pまで下降する時間</label><br>
                <label><input type="radio" name="type" value="pressure_after_t"> T秒後の圧力</label>
            </div>
            <hr class="my-2">
            <div class="pressure-input-sp4-initial"></div>
            <div class="input-group"><label class="input-label">タンク容積 (L)</label><input type="number" name="volume" class="input-field" value="60"></div>
            <div class="mode-1989 hidden"><div class="input-group"><label class="input-label">絞り部のS (mm²)</label><input type="number" name="s" class="input-field" value="18"></div></div>
            <div class="mode-2020 hidden"><div class="input-group"><label class="input-label">回路のC (L/(s·bar))</label><input type="number" name="c_conductance_sp4" class="input-field" value="4.0"></div></div>
            <div id="sp4-p-input" class="hidden"><div class="pressure-input-sp4-target"></div></div>
            <div id="sp4-t-input" class="hidden"><div class="input-group"><label class="input-label">放出時間 T (s)</label><input type="number" name="release_time" class="input-field" value="2.5"></div></div>
        `)}
    `;
}

function updateModalUIForMode(modalId) {
    const modal = document.getElementById(`modal-${modalId}`);
    if (!modal) return;

    // Toggle visibility of mode-specific containers
    modal.querySelectorAll('.mode-1989').forEach(el => toggleVis(el, currentMode === '1989'));
    modal.querySelectorAll('.mode-2020').forEach(el => toggleVis(el, currentMode === '2020'));

    // Update labels and units
    if (modalId === 'P0') {
        const unit = currentMode === '1989' ? 'kgf' : 'N';
        modal.querySelector('.load-weight-label').textContent = `負荷の重量 (${unit})`;
    }
    if (modalId === 'P1') {
        const unit = currentMode === '1989' ? 'kgf' : 'N';
        modal.querySelector('.load-weight-label').textContent = `負荷重量 (${unit})`;
        const necessarySLabel = modal.querySelector('#p1-type-label-s span');
        if (necessarySLabel) {
            necessarySLabel.textContent = currentMode === '1989' ? '必要有効断面積を計算' : '必要流量特性を計算';
        }
    }
    if (modalId === 'P2') {
        modal.querySelector('h2').textContent = currentMode === '1989' ? '有効断面積' : '流量特性';
    }
    
    // Dynamically create pressure inputs with correct defaults
    const pressureInputs = {
        'P0': { selector: '.pressure-input-p0', name: 'pressure', label: '作動圧力', value: 0.4 },
        'P1': { selector: '.pressure-input-p1', name: 'pressure', label: '作動圧力', value: 0.5 },
        'P3': { selector: '.pressure-input-p3', name: 'pressure', label: '作動圧力', value: 0.4 },
        'SP2':{ selector: '.pressure-input-sp2', name: 'pressure', label: '元圧力', value: 0.7 },
        'SP3_supply': { selector: '.pressure-input-sp3-supply', name: 'supply_pressure', label: '供給圧力', value: 0.3 },
        'SP3_target': { selector: '.pressure-input-sp3-target', name: 'target_pressure', label: '目標圧力P', value: 0.25 },
        'SP4_initial': { selector: '.pressure-input-sp4-initial', name: 'initial_pressure', label: '初期圧力', value: 0.5 },
        'SP4_target': { selector: '.pressure-input-sp4-target', name: 'target_pressure', label: '目標圧力P', value: 0.4 },
        'P4_p1_1989': { selector: '.pressure-input-p4-p1-1989', name: 'p1', label: '1次側圧力', value: 0.5 },
        'P4_p2_1989': { selector: '.pressure-input-p4-p2-1989', name: 'p2', label: '2次側圧力', value: 0.38 },
        'P4_p1bleed_1989': { selector: '.pressure-input-p4-p1bleed-1989', name: 'p1_bleed', label: '圧力', value: 0.3 },
        'P4_p1_2020': { selector: '.pressure-input-p4-p1-2020', name: 'p1_2020', label: '1次側圧力', value: 0.5 },
        'P4_p2_2020': { selector: '.pressure-input-p4-p2-2020', name: 'p2_2020', label: '2次側圧力', value: 0.38 },
    };

    for (const key in pressureInputs) {
        const { selector, name, label, value } = pressureInputs[key];
        const container = modal.querySelector(selector);
        if (container) {
            container.innerHTML = createPressureInput(name, label, value, `${name}_unit`, currentMode);
        }
    }
}


function toggleSizeLock() {
    isSizeLocked = !isSizeLocked;
    lockIcon.classList.toggle('hidden', isSizeLocked);
    unlockIcon.classList.toggle('hidden', !isSizeLocked);
    if (!isSizeLocked) {
        adjustAppScale();
    }
    updateSubDisplay(isSizeLocked ? '画面サイズ固定 ON' : '画面サイズ固定 OFF', true);
}

function adjustAppScale() {
    if (isSizeLocked) return;
    const appContainer = document.getElementById('app-container');
    const baseWidth = 393;
    const baseHeight = 852;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const scaleX = viewportWidth / baseWidth;
    const scaleY = viewportHeight / baseHeight;

    const scale = Math.min(scaleX, scaleY);

    appContainer.style.transform = `scale(${scale})`;
}

// --- Event Listener Setup ---
function setupEventListeners() {
    const appContainer = document.getElementById('app-container');

    // Click event delegation
    appContainer.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action]');
        if (!button) return;

        event.stopPropagation();

        const { action, value, modalId } = button.dataset;

        switch (action) {
            case 'openModal': openModal(value); break;
            case 'closeModal': closeModal(modalId); break;
            case 'executeCalculation': executeCalculation(modalId); break;
            case 'moveCursor': moveCursor(value); break;
            case 'toggleInsertMode': toggleInsertMode(); break;
            case 'clearDisplay': clearDisplay(value); break;
            case 'pressMemory': pressMemory(value); break;
            case 'pressKey': pressKey(value); break;
            case 'pressOperator': pressOperator(value); break;
            case 'calculate': calculate(); break;
            case 'toggleSizeLock': toggleSizeLock(); break;
        }
    });

    // Change event delegation
    appContainer.addEventListener('change', (event) => {
        const element = event.target;
        
        // For mode switching
        if (element.matches('input[name="calc_mode"]')) {
            handleModeChange(element.value);
        }

        // For dynamic UI changes in modals
        const changeHandler = element.closest('[data-change-handler]');
        if (changeHandler) {
            const handlerName = changeHandler.dataset.changeHandler;
            const modal = element.closest('.modal-content');
            if(!modal) return;

            switch (handlerName) {
                case 'toggleP0':
                    toggleVis(modal.querySelector('#p0-load-inputs'), element.value === 'load_rate');
                    break;
                case 'toggleP1':
                    toggleVis(modal.querySelector('#p1-time-inputs'), element.value === 'time');
                    toggleVis(modal.querySelector('#p1-s-inputs'), element.value === 'necessary_s');
                    break;
                case 'toggleP2':
                    toggleVis(modal.querySelector('#p2-pipe-inputs'), element.value === 'pipe');
                    toggleVis(modal.querySelector('#p2-composite-inputs'), element.value === 'composite');
                    break;
                case 'generateCylinders':
                    generateCylinderInputs(parseInt(element.value, 10) || 0);
                    break;
                case 'toggleP4':
                    toggleVis(modal.querySelector('#p4-flow-inputs-1989'), element.value === 'flow');
                    toggleVis(modal.querySelector('#p4-bleed-inputs-1989'), element.value === 'bleed');
                    break;
                case 'toggleSP3':
                    toggleVis(modal.querySelector('#sp3-p-input'), element.value === 'fill_time_to_p');
                    toggleVis(modal.querySelector('#sp3-t-input'), element.value === 'pressure_after_t');
                    break;
                case 'toggleSP4':
                    toggleVis(modal.querySelector('#sp4-p-input'), element.value === 'release_time_to_p');
                    toggleVis(modal.querySelector('#sp4-t-input'), element.value === 'pressure_after_t');
                    break;
            }
        }
    });

    // Feedback link click handler
    const feedbackLink = document.getElementById('feedback-link');
    if (feedbackLink) {
        feedbackLink.addEventListener('click', async (event) => {
            event.preventDefault(); // デフォルトのリンク動作をキャンセル
            try {
                const response = await fetch(`${BACKEND_URL}/feedback-url`);
                if (!response.ok) {
                    throw new Error('Could not fetch feedback URL.');
                }
                const data = await response.json();
                if (data.url) {
                    window.open(data.url, '_blank');
                }
            } catch (error) {
                console.error('Feedback link error:', error);
                updateSubDisplay('リンクを取得できませんでした', true);
            }
        });
    }
}

function generateCylinderInputs(count) {
    const container = document.getElementById('p3-cylinder-inputs');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 1; i <= count; i++) {
        container.innerHTML += `
            <div class="cylinder-group border-t pt-2 mt-2">
                <h4 class="font-bold mb-2">シリンダ ${i}</h4>
                <div class="input-group"><label class="input-label">内径 (mm)</label><input type="number" name="diameter" class="input-field" value="40"></div>
                <div class="input-group"><label class="input-label">ストローク (mm)</label><input type="number" name="stroke" class="input-field" value="100"></div>
                <div class="input-group"><label class="input-label">動作頻度 (回/min)</label><input type="number" name="frequency" class="input-field" value="12"></div>
                <div class="input-group"><label class="input-label">配管長さ (m)</label><input type="number" name="pipe_length" class="input-field" value="1"></div>
                <div class="input-group"><label class="input-label">配管内径 (mm)</label><input type="number" name="pipe_diameter" class="input-field" value="6"></div>
            </div>
        `;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    createAllModals();
    generateCylinderInputs(2);
    renderDisplayWithCursor();
    adjustAppScale();
    setupEventListeners(); // Attach all event listeners
    handleModeChange(currentMode); // Initialize UI for the default mode
});
window.addEventListener('resize', adjustAppScal