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

let expression = '0';
let cursorPosition = 1;
let insertMode = true;
let isFunctionResultDisplayed = false;
let memoryValue = 0;
let lastAns = 0;
let isSizeLocked = false;
let subDisplayMessageTimeout;
const ATMOSPHERIC_PRESSURE = 1.033;
const G = 9.8;
const G_CM = 980;

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

// --- Modal Control & Logic ---
function openModal(modalId) {
    const modal = document.getElementById(`modal-${modalId}`);
    if (modal) {
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

function toggleVis(elementId, condition) {
    document.getElementById(elementId).classList.toggle('hidden', !condition);
}

function handleUnitChange(radio) {
    const MPA_TO_KGF = 10.19716;
    const KGF_TO_MPA = 0.0980665;
    
    const inputGroup = radio.closest('.input-group');
    if (!inputGroup) return;

    const numberInput = inputGroup.querySelector('input[type=number]');
    if (!numberInput) return;

    let currentValue = parseFloat(numberInput.value);

    if (isNaN(currentValue)) return;

    if (radio.value === 'K/C') {
        numberInput.value = (currentValue * MPA_TO_KGF).toFixed(2);
    } else {
        numberInput.value = (currentValue * KGF_TO_MPA).toFixed(3);
    }
}

async function executeCalculation(functionId) {
    const form = document.getElementById(`form-${functionId}`);
    const formData = new FormData(form);
    const params = {};
    for (let [key, value] of formData.entries()) {
        params[key] = value;
    }

    const MPA_TO_KGF = 10.19716;
    const KGF_TO_MPA = 0.0980665;

    const pressureFieldMap = {
        'pressure': 'pressure_unit',
        'p1': 'p1_unit',
        'p2': 'p2_unit',
        'p1_bleed': 'p1_bleed_unit',
        'supply_pressure': 'supply_pressure_unit',
        'target_pressure': 'target_pressure_unit',
        'initial_pressure': 'initial_pressure_unit'
    };
    
    for (const fieldName in pressureFieldMap) {
        if (params[fieldName] && params[fieldName] !== '') {
            const unitFieldName = pressureFieldMap[fieldName];
            if (params[unitFieldName] === 'MPa') {
                params[fieldName] = parseFloat(params[fieldName]) * MPA_TO_KGF;
            } else {
                params[fieldName] = parseFloat(params[fieldName]);
            }
        }
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
    
    try {
        updateSubDisplay('計算中...', true);
        const response = await fetch(`${BACKEND_URL}/calculate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ functionId, params }),
        });

        if (!response.ok) {
            throw new Error(`サーバーエラー: ${response.status}`);
        }

        const result = await response.json();

        const primaryUnitRadio = form.querySelector('input[name$="_unit"]:checked');
        const primaryUnit = primaryUnitRadio ? primaryUnitRadio.value : 'MPa';

        if (functionId === 'SP2' && result["圧力損失"]) {
            let valueKgf = parseFloat(result["圧力損失"]);
            result["圧力損失"] = primaryUnit === 'MPa' 
                ? `${(valueKgf * KGF_TO_MPA).toFixed(3)} MPa`
                : `${valueKgf.toFixed(2)} K/C`;
        }
        if ((functionId === 'SP3' || functionId === 'SP4') && result["T秒後の圧力"]) {
            let valueKgf = parseFloat(result["T秒後の圧力"]);
             result["T秒後の圧力"] = primaryUnit === 'MPa'
                ? `${(valueKgf * KGF_TO_MPA).toFixed(3)} MPa`
                : `${valueKgf.toFixed(2)} K/C`;
        }
        
        displayCalculationResult(functionId, result);
        closeModal(functionId);
    } catch (e) {
        console.error("Calculation Error in " + functionId, e);
        updateSubDisplay("計算エラー: " + e.message, true);
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

function createModal(id, title, content) {
    return `
        <div id="modal-${id}" class="modal absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 hidden">
            <div class="modal-content bg-gray-100 rounded-lg shadow-xl w-full max-w-sm p-6 border-2 border-gray-300">
                <form id="form-${id}">
                    <h2 class="text-xl font-bold mb-4 text-gray-800">${title}</h2>
                    <div class="space-y-3 text-sm">${content}</div>
                    <div class="mt-6 flex justify-end space-x-3">
                        <button type="button" data-action="closeModal" data-modal-id="${id}" class="key bg-gray-300 text-gray-800 px-4 py-2 font-medium">キャンセル</button>
                        <button type="button" data-action="executeCalculation" data-modal-id="${id}" class="key bg-blue-600 text-white px-4 py-2 font-bold">計算</button>
                    </div>
                </form>
            </div>
        </div>`;
}

function createPressureInput(name, label, defaultValueMpa, unitName) {
    return `
        <div class="input-group">
            <label class="input-label">${label}</label>
            <div class="flex items-center mt-1">
                <input type="number" name="${name}" class="input-field flex-grow" value="${defaultValueMpa}" step="any">
                <div class="text-xs pl-2 flex-shrink-0 space-y-1">
                    <label class="flex items-center"><input type="radio" name="${unitName}" value="MPa" checked> <span class="pl-1">MPa</span></label>
                    <label class="flex items-center"><input type="radio" name="${unitName}" value="K/C"> <span class="pl-1">K/C</span></label>
                </div>
            </div>
        </div>
    `;
}

function createAllModals() {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
        ${createModal('P0', 'シリンダ出力と負荷率', `
            <div data-change-handler="toggleP0">
                <label class="flex items-center"><input type="radio" name="type" value="output" checked><span class="ml-2">出力のみ</span></label>
                <label class="flex items-center"><input type="radio" name="type" value="load_rate"><span class="ml-2">負荷率も計算</span></label>
            </div>
            <hr class="my-2">
            ${createPressureInput('pressure', '作動圧力', '0.4', 'pressure_unit')}
            <div class="input-group"><label class="input-label">シリンダ内径 (MM)</label><input type="number" name="cylinder_diameter" class="input-field" value="63"></div>
            <div class="input-group"><label class="input-label">ロッド径 (MM)</label><input type="number" name="rod_diameter" class="input-field" value="24"></div>
            <hr class="my-2">
            <div class="input-group">
                <label class="input-label">出力単位</label>
                <div class="flex items-center space-x-4 mt-1">
                    <label class="flex items-center"><input type="radio" name="output_unit" value="KGF" checked><span class="ml-2">KGF (重量キログラム)</span></label>
                    <label class="flex items-center"><input type="radio" name="output_unit" value="N"><span class="ml-2">N (ニュートン)</span></label>
                </div>
            </div>
            <div id="p0-load-inputs" class="space-y-3 pl-5 hidden">
                <div class="input-group"><label class="input-label">負荷の重量 (Kgf)</label><input type="number" name="load_weight" class="input-field" value="200"></div>
                <div class="input-group"><label class="input-label">摩擦係数</label><input type="number" name="load_friction" class="input-field" value="0.3"></div>
            </div>
        `)}
        ${createModal('P1', '運動（動作時間・必要S）', `
            <div data-change-handler="toggleP1">
                <label class="flex items-center"><input type="radio" name="type" value="time" checked><span class="ml-2">動作時間を計算</span></label>
                <label class="flex items-center"><input type="radio" name="type" value="necessary_s"><span class="ml-2">必要有効断面積を計算</span></label>
            </div>
            <div>
                <label class="flex items-center"><input type="radio" name="direction" value="push" checked><span class="ml-2">PUSH</span></label>
                <label class="flex items-center"><input type="radio" name="direction" value="pull"><span class="ml-2">PULL</span></label>
            </div>
            <hr class="my-2">
            <div id="p1-time-inputs">
                <div class="input-group"><label class="input-label">合成有効断面積S (mm²)</label><input type="number" name="s_composite" class="input-field" value="5.68"></div>
                <div class="input-group"><label class="input-label">配管容積 ΔV (cm³)</label><input type="number" name="pipe_volume" class="input-field" value="50"></div>
            </div>
            <div id="p1-s-inputs" class="hidden">
                <div class="input-group"><label class="input-label">目標動作時間 (sec)</label><input type="number" name="time" class="input-field" value="0.8"></div>
            </div>
            ${createPressureInput('pressure', '作動圧力', '0.5', 'pressure_unit')}
            <div class="input-group"><label class="input-label">シリンダ内径 (mm)</label><input type="number" name="cylinder_diameter" class="input-field" value="50"></div>
            <div class="input-group"><label class="input-label">ロッド径 (mm)</label><input type="number" name="rod_diameter" class="input-field" value="20"></div>
            <div class="input-group"><label class="input-label">ストローク (mm)</label><input type="number" name="stroke" class="input-field" value="300"></div>
            <div class="input-group"><label class="input-label">負荷重量 (Kgf)</label><input type="number" name="load_weight" class="input-field" value="49"></div>
            <div class="input-group"><label class="input-label">摩擦係数</label><input type="number" name="load_friction" class="input-field" value="0.4"></div>
        `)}
         ${createModal('P2', '有効断面積', `
            <div data-change-handler="toggleP2">
                <label class="flex items-center"><input type="radio" name="type" value="pipe" checked><span class="ml-2">配管のS</span></label>
                <label class="flex items-center"><input type="radio" name="type" value="composite"><span class="ml-2">Sの合成</span></label>
            </div>
            <hr class="my-2">
            <div id="p2-pipe-inputs">
                <div class="input-group"><label class="input-label">配管長さ (m)</label><input type="number" name="pipe_length" class="input-field" value="3"></div>
                <div class="input-group"><label class="input-label">配管種類</label><select name="pipe_type" class="input-field"><option value="steel">鋼管</option><option value="nylon">ナイロンチューブ</option></select></div>
                <div class="input-group"><label class="input-label">配管内径 (mm)</label><input type="number" name="pipe_diameter" class="input-field" value="16.1"></div>
            </div>
            <div id="p2-composite-inputs" class="hidden">
                <div class="input-group"><label class="input-label">各有効断面積 (カンマ区切り)</label><input type="text" name="s_values" class="input-field" value="15,8,20"></div>
            </div>
        `)}
        ${createModal('P3', '空気消費量', `
            ${createPressureInput('pressure', '作動圧力', '0.4', 'pressure_unit')}
            <div class="input-group"><label class="input-label">シリンダの本数</label><input type="number" name="num_cylinders" class="input-field" value="2" data-change-handler="generateCylinders"></div>
            <div id="p3-cylinder-inputs" class="space-y-4"></div>
        `)}
        ${createModal('P4', '流量', `
            <div data-change-handler="toggleP4">
                <label class="flex items-center"><input type="radio" name="type" value="flow" checked><span class="ml-2">流量</span></label>
                <label class="flex items-center"><input type="radio" name="type" value="bleed"><span class="ml-2">ブリード量</span></label>
            </div>
            <hr class="my-2">
            <div id="p4-flow-inputs">
                ${createPressureInput('p1', '1次側圧力', '0.5', 'p1_unit')}
                ${createPressureInput('p2', '2次側圧力', '0.38', 'p2_unit')}
                <div class="input-group"><label class="input-label">絞り部のS (mm²)</label><input type="number" name="s" class="input-field" value="10"></div>
            </div>
            <div id="p4-bleed-inputs" class="hidden">
                ${createPressureInput('p1_bleed', '圧力', '0.3', 'p1_bleed_unit')}
                <div class="input-group"><label class="input-label">ノズル内径 (mm)</label><input type="number" name="nozzle_diameter" class="input-field" value="0.8"></div>
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
            ${createPressureInput('pressure', '元圧力', '0.7', 'pressure_unit')}
            <div class="input-group"><label class="input-label">流量 (l/min)</label><input type="number" name="flow" class="input-field" value="5000"></div>
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
            ${createPressureInput('supply_pressure', '供給圧力', '0.3', 'supply_pressure_unit')}
            <div class="input-group"><label class="input-label">タンク容積 (l)</label><input type="number" name="volume" class="input-field" value="20"></div>
            <div class="input-group"><label class="input-label">絞り部のS (mm²)</label><input type="number" name="s" class="input-field" value="12"></div>
            <div id="sp3-p-input" class="hidden">${createPressureInput('target_pressure', '目標圧力 P', '0.25', 'target_pressure_unit')}</div>
            <div id="sp3-t-input" class="hidden"><div class="input-group"><label class="input-label">充填時間 T (sec)</label><input type="number" name="fill_time" class="input-field" value="3"></div></div>
        `)}
        ${createModal('SP4', 'タンクからの空気圧の放出', `
             <div data-change-handler="toggleSP4">
                <label><input type="radio" name="type" value="release_time_full" checked> 放出完了時間</label><br>
                <label><input type="radio" name="type" value="release_time_to_p"> Pまで下降する時間</label><br>
                <label><input type="radio" name="type" value="pressure_after_t"> T秒後の圧力</label>
            </div>
            <hr class="my-2">
            ${createPressureInput('initial_pressure', '初期圧力', '0.5', 'initial_pressure_unit')}
            <div class="input-group"><label class="input-label">タンク容積 (l)</label><input type="number" name="volume" class="input-field" value="60"></div>
            <div class="input-group"><label class="input-label">絞り部のS (mm²)</label><input type="number" name="s" class="input-field" value="18"></div>
            <div id="sp4-p-input" class="hidden">${createPressureInput('target_pressure', '目標圧力 P', '0.4', 'target_pressure_unit')}</div>
            <div id="sp4-t-input" class="hidden"><div class="input-group"><label class="input-label">放出時間 T (sec)</label><input type="number" name="release_time" class="input-field" value="2.5"></div></div>
        `)}
    `;
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
        
        // For unit conversion
        if (element.matches('input[type="radio"][name$="_unit"]')) {
            handleUnitChange(element);
        }

        // For dynamic UI changes in modals
        const changeHandler = element.closest('[data-change-handler]');
        if (changeHandler) {
            const handlerName = changeHandler.dataset.changeHandler;
            switch (handlerName) {
                case 'toggleP0':
                    toggleVis('p0-load-inputs', element.value === 'load_rate');
                    break;
                case 'toggleP1':
                    toggleVis('p1-time-inputs', element.value === 'time');
                    toggleVis('p1-s-inputs', element.value === 'necessary_s');
                    break;
                case 'toggleP2':
                    toggleVis('p2-pipe-inputs', element.value === 'pipe');
                    toggleVis('p2-composite-inputs', element.value === 'composite');
                    break;
                case 'generateCylinders':
                    generateCylinderInputs(element.value);
                    break;
                case 'toggleP4':
                    toggleVis('p4-flow-inputs', element.value === 'flow');
                    toggleVis('p4-bleed-inputs', element.value === 'bleed');
                    break;
                case 'toggleSP3':
                    toggleVis('sp3-p-input', element.value === 'fill_time_to_p');
                    toggleVis('sp3-t-input', element.value === 'pressure_after_t');
                    break;
                case 'toggleSP4':
                    toggleVis('sp4-p-input', element.value === 'release_time_to_p');
                    toggleVis('sp4-t-input', element.value === 'pressure_after_t');
                    break;
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    createAllModals();
    generateCylinderInputs(2);
    renderDisplayWithCursor();
    adjustAppScale();
    setupEventListeners(); // Attach all event listeners
});
window.addEventListener('resize', adjustAppScale);
