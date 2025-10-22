// --- UI State & Logic ---
// このファイルはUIの操作、イベントハンドリング、DOMの更新を担当します。
// 計算ロジックそのものは含みません。
// --- グローバル変数・定数定義 ---
// DOM要素の取得
const displayArea = document.getElementById('display-area'); // 表示エリア全体
const display = document.getElementById('display'); // メインディスプレイ（計算式や結果表示）
const subDisplayContainer = document.getElementById('sub-display-container'); // サブディスプレイのコンテナ
const subDisplayContent = document.getElementById('sub-display-content'); // サブディスプレイのコンテンツ部分
const scrollIndicator = document.getElementById('scroll-indicator'); // スクロールインジケーター（▲▼）
const scrollUpIndicator = document.getElementById('scroll-up-indicator'); // 上スクロールインジケーター
const scrollDownIndicator = document.getElementById('scroll-down-indicator'); // 下スクロールインジケーター
const lockIcon = document.getElementById('lock-icon'); // 画面サイズ固定用のロックアイコン
const unlockIcon = document.getElementById('unlock-icon'); // 画面サイズ固定解除用のアンロックアイコン

// 電卓の状態を管理する変数
let expression = '0'; // 現在の計算式を保持する文字列
let cursorPosition = 1; // カーソルの位置
let insertMode = true; // true: 挿入モード, false: 上書きモード
let isFunctionResultDisplayed = false; // 機能計算の結果が表示されているかどうかのフラグ
let memoryValue = 0; // メモリー機能の値
let lastAns = 0; // 直前の計算結果 (ANSキー用)
let isSizeLocked = false; // 画面サイズが固定されているかどうかのフラグ
let subDisplayMessageTimeout; // サブディスプレイの一時的なメッセージを消すためのタイマーID

// 物理定数
const ATMOSPHERIC_PRESSURE = 1.033; // 大気圧 (kgf/cm²)
const G = 9.8; // 重力加速度 (m/s²)
const G_CM = 980; // 重力加速度 (cm/s²)

// ★★★ 重要 ★★★
// Renderにデプロイした後、バックエンドサーバーのURLをここに設定してください。
const BACKEND_URL = 'https://pkun-backend.onrender.com'; // 例: 'https://your-app-name.onrender.com'

// サブディスプレイのスクロール状態
let subDisplayScrollTop = 0; // 現在のスクロール位置
const SUB_DISPLAY_LINE_HEIGHT = 25.2; // 1行あたりの高さ (px)

// --- 表示関連のコア関数 ---

/**
 * 数値文字列を3桁区切りのカンマ付き形式にフォーマットします。
 * @param {string} str - フォーマット対象の数値文字列。
 * @returns {string} カンマ区切りされた文字列。
 */
function formatNumberString(str) {
    const parts = str.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
}

/**
 * 計算式内の数値をカンマ区切りにして、表示用にフォーマットします。
 * @param {string} expr - フォーマット対象の計算式文字列。
 * @returns {string} 表示用にフォーマットされた計算式文字列。
 */
function formatExpressionForDisplay(expr) {
    // 正規表現で演算子を区切り文字として計算式を分割し、数値部分のみフォーマットする
    return expr.split(/(\s[+\-×÷]\s)/g).map(part => {
        // isNaN(parseFloat(part)) -> partが数値でない場合はtrue
        // !part.includes('e') -> 指数表記でないことを確認
        if (!isNaN(parseFloat(part)) && !part.includes('e')) {
            return formatNumberString(part);
        }
        return part;
    }).join('');
}

/**
 * サブディスプレイの表示を更新します。
 * @param {string} text - 表示するテキスト。
 * @param {boolean} [temporary=false] - trueの場合、1.5秒後に表示を元に戻す。
 */
function updateSubDisplay(text, temporary = false) {
    clearTimeout(subDisplayMessageTimeout); // 既存のタイマーをクリア
    subDisplayContent.textContent = text;
    if (temporary) {
        const previousText = isFunctionResultDisplayed ? subDisplayContent.textContent : expression;
        subDisplayMessageTimeout = setTimeout(() => {
            // 1.5秒後に、もし表示内容が変わっていなければ元の表示に戻す
            if (subDisplayContent.textContent === text) {
                subDisplayContent.textContent = isFunctionResultDisplayed ? previousText : expression;
            }
        }, 1500);
    }
}

/**
 * メインディスプレイの表示をカーソル付きで再描画します。
 * 文字数に応じてフォントサイズを動的に変更します。
 */
function renderDisplayWithCursor() {
    const formattedExpression = formatExpressionForDisplay(expression);
    const displayLength = formattedExpression.length;
    
    // 文字数に応じてフォントサイズを調整
    display.classList.remove('text-5xl', 'text-4xl', 'text-3xl');
    if (displayLength > 15) {
        display.classList.add('text-3xl');
    } else if (displayLength > 11) {
        display.classList.add('text-4xl');
    } else {
        display.classList.add('text-5xl');
    }

    // 機能計算結果表示モードの場合は、カーソルを0の位置に表示して終了
    if (isFunctionResultDisplayed) {
        display.innerHTML = '<span class="cursor">0</span>';
        return;
    }
    
    // カンマ区切りされた表示文字列内での正しいカーソル位置を計算
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

    // カーソル位置で文字列を分割し、カーソル用のspanタグを挿入
    const left = formattedExpression.substring(0, displayCursorPos);
    let cursorChar = formattedExpression.substring(displayCursorPos, displayCursorPos + 1) || '&nbsp;'; // カーソル位置の文字、なければスペース
    const right = formattedExpression.substring(displayCursorPos + 1);
    display.innerHTML = `${left}<span class="cursor">${cursorChar}</span>${right}`;
}

// --- 入力処理 ---

/**
 * カーソル位置に文字を挿入または上書きします。
 * @param {string} char - 挿入する文字。
 */
function insertCharacter(char) {
    // 機能計算結果が表示されている場合は、まず表示をクリアする
    if (isFunctionResultDisplayed) clearDisplay('all');
    
    // 初期状態'0'の時、'.'以外が入力されたら'0'を消す
    if (expression === '0' && char !== '.') {
        expression = '';
        cursorPosition = 0;
    }

    // 現在入力中の数値部分の長さをチェックし、15桁を超えないようにする
    const currentNumber = expression.split(/[\s+\-×÷]/).pop();
    if (char.match(/[0-9]/) && currentNumber.replace('.', '').length >= 15) {
        return; // 15桁以上は入力させない
    }

    // カーソル位置に文字を挿入/上書き
    const left = expression.substring(0, cursorPosition);
    const right = insertMode ? expression.substring(cursorPosition) : expression.substring(cursorPosition + 1);
    expression = left + char + right;
    cursorPosition += char.length;
    
    // 表示を更新
    renderDisplayWithCursor();
    updateSubDisplay(expression);
}

// --- キー操作ハンドラ ---

/**
 * 数字キーまたはANSキーが押された時の処理。
 * @param {string} key - 押されたキーの値 ('0'~'9', '.', 'ANS')。
 */
function pressKey(key) {
    if (key === 'ANS') {
        insertCharacter(String(lastAns));
    } else {
        insertCharacter(key);
    }
}

/**
 * 演算子キーが押された時の処理。
 * @param {string} op - 押された演算子 ('+', '-', '×', '÷')。
 */
function pressOperator(op) {
    // 演算子の前後にスペースを入れて挿入する
    insertCharacter(` ${op} `);
}

/**
 * '='キーが押された時の処理。計算を実行します。
 */
function calculate() {
    try {
        // 表示用の'×'と'÷'を計算可能な'*'と'/'に置換
        let evalExpression = expression.replace(/,/g, '').replace(/÷/g, '/').replace(/×/g, '*');
        
        // 無効な文字が含まれていないかチェック
        if (/[^0-9\.\+\-\*\/\(\)\se]/.test(evalExpression)) throw new Error("無効な文字");
        
        // Functionコンストラクタを使って文字列を数式として評価・実行
        let result = new Function('return ' + evalExpression)();
        lastAns = result; // 結果をANS用に保存
        updateSubDisplay(expression + ' =');
        
        // 結果の桁数に応じて通常表記か指数表記かを決定
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

/**
 * 'C'または'AC'キーが押された時の処理。表示をクリアします。
 * @param {string} type - 'char' (一文字削除) または 'all' (全削除)。
 */
function clearDisplay(type) {
    if (type === 'all' || isFunctionResultDisplayed) {
        // 全クリア
        expression = '0';
        cursorPosition = 1;
        isFunctionResultDisplayed = false;
        displayArea.classList.remove('function-result-mode');
        updateSubDisplay('');
        scrollIndicator.classList.add('hidden');
        subDisplayContent.textContent = '';
    } else {
        // 一文字削除 (バックスペース)
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

/**
 * '←'または'→'キーが押された時の処理。カーソルを移動または結果をスクロールします。
 * @param {string} direction - 'left' または 'right'。
 */
function moveCursor(direction) {
    if (isFunctionResultDisplayed) {
        // 機能計算結果表示モードでは、サブディスプレイをスクロール
        const maxScroll = Math.max(0, subDisplayContent.scrollHeight - subDisplayContainer.clientHeight);
        if (direction === 'right') { // '→'キーで下にスクロール
            subDisplayScrollTop = Math.min(subDisplayScrollTop + SUB_DISPLAY_LINE_HEIGHT, maxScroll);
        } else { // '←'キーで上にスクロール
            subDisplayScrollTop = Math.max(0, subDisplayScrollTop - SUB_DISPLAY_LINE_HEIGHT);
        }
        updateSubDisplayScroll();
    } else {
        // 通常の電卓モードでは、カーソルを移動
        if (direction === 'left') {
            cursorPosition = Math.max(0, cursorPosition - 1);
        } else {
            cursorPosition = Math.min(expression.length, cursorPosition + 1);
        }
        renderDisplayWithCursor();
    }
}

/**
 * 'INS'キーが押された時の処理。挿入/上書きモードを切り替えます。
 */
function toggleInsertMode() {
    insertMode = !insertMode;
    updateSubDisplay(insertMode ? 'INS' : 'OVR', true);
}

/**
 * メモリーキー ('MC', 'MR', 'M+', 'M-') が押された時の処理。
 * @param {string} type - 押されたメモリーキーの種類。
 */
function pressMemory(type) {
    let currentValue;
    try {
        // 現在の表示内容を計算して数値に変換
        currentValue = new Function('return ' + expression.replace(/,/g, '').replace(/÷/g, '/').replace(/×/g, '*'))();
    } catch(e) { currentValue = NaN; }

    switch (type) {
        case 'MC': memoryValue = 0; updateSubDisplay('メモリークリア', true); break;
        case 'MR': expression = String(memoryValue); cursorPosition = expression.length; renderDisplayWithCursor(); updateSubDisplay(expression); break;
        case 'M+': if (!isNaN(currentValue)) { memoryValue += currentValue; updateSubDisplay(`${currentValue} を加算`, true); } break;
        case 'M-': if (!isNaN(currentValue)) { memoryValue -= currentValue; updateSubDisplay(`${currentValue} を減算`, true); } break;
    }
}

// --- 入力値検証ロジック ---

/**
 * 特定の入力フィールドに検証メッセージ（ツールチップ）を表示または非表示にします。
 * @param {HTMLElement} input - 対象のinput要素。
 * @param {string|null} message - 表示するエラーメッセージ。nullの場合はメッセージを非表示にします。
 */
function setValidationMessage(input, message) {
    const group = input.closest('.input-group');
    const tooltip = group ? group.querySelector('.validation-tooltip') : null;

    if (message) {
        // エラーメッセージを表示
        input.classList.add('input-error'); // 入力フィールドの枠を赤くする
        if (tooltip) {
            tooltip.textContent = message;
            tooltip.classList.remove('hidden');
        }
    } else {
        // エラーメッセージを非表示
        input.classList.remove('input-error'); // 入力フィールドの枠を元に戻す
        if (tooltip) {
            // ★★★ 修正箇所 ★★★
            // メッセージのテキストを空にしてから非表示クラスを追加します。
            // これにより、CSSの競合で非表示にならなかった場合でも、テキストが見えなくなります。
            tooltip.textContent = '';
            tooltip.classList.add('hidden');
        }
    }
}

/**
 * 1つの入力フィールドを、data-validate属性に基づいて検証します。
 * @param {HTMLElement} input - 検証するinput要素。
 * @param {HTMLFormElement} form - 属しているform要素（他のフィールドとの比較用）。
 * @returns {boolean} 有効な場合はtrue、無効な場合はfalse。
 */
function validateInput(input, form) {
    const value = parseFloat(input.value);
    const rules = input.dataset.validate;
    if (!rules) return true; // 検証ルールがなければ常に有効

    const ruleList = rules.split('|'); // 例: "required|min:0|max:10"
    for (const rule of ruleList) {
        const [ruleName, param] = rule.split(':'); // 例: "min:0" -> ruleName='min', param='0'
        
        // 必須入力チェック
        if (ruleName === 'required' && input.value.trim() === '') {
            setValidationMessage(input, 'この項目は必須です。');
            return false;
        }
        // 数値かどうかチェック
        if (isNaN(value) && ruleName !== 'required') {
             setValidationMessage(input, '数値を入力してください。');
             return false;
        }

        // 各ルールに応じた検証
        switch (ruleName) {
            case 'min': // 最小値チェック
                if (value < parseFloat(param)) {
                    setValidationMessage(input, `${param}以上の値を入力してください。`);
                    return false;
                }
                break;
            case 'max': // 最大値チェック
                if (value > parseFloat(param)) {
                    setValidationMessage(input, `${param}以下の値を入力してください。`);
                    return false;
                }
                break;
            case 'lessThan': // 他のフィールドより小さいかチェック
                const otherField = form.querySelector(`[name="${param}"]`);
                if (otherField) {
                    // 単位が異なる場合も考慮して、両方の値をkgf/cm²に換算して比較
                    const MPA_TO_KGF = 10.19716;
                    let currentValueInKgc = value;
                    const currentUnit = form.querySelector(`input[name="${input.name}_unit"]:checked`);
                    if (currentUnit && currentUnit.value === 'MPa') {
                        currentValueInKgc = value * MPA_TO_KGF;
                    }

                    let otherValueInKgc = parseFloat(otherField.value);
                    const otherUnit = form.querySelector(`input[name="${otherField.name}_unit"]:checked`);
                    if (otherUnit && otherUnit.value === 'MPa') {
                        otherValueInKgc = otherValueInKgc * MPA_TO_KGF;
                    }

                    if (currentValueInKgc >= otherValueInKgc) {
                        const otherLabel = otherField.closest('.input-group').querySelector('.input-label').textContent;
                        setValidationMessage(input, `${otherLabel}より小さい値を入力してください。`);
                        return false;
                    }
                }
                break;
             case 'integer': // 整数チェック
                if (!Number.isInteger(value)) {
                    setValidationMessage(input, '整数を入力してください。');
                    return false;
                }
                break;
        }
    }

    // 全てのルールをパスした場合、エラーメッセージを消す
    setValidationMessage(input, null);
    return true;
}

/**
 * フォーム内の表示されている全ての入力フィールドを検証します。
 * @param {string} formId - 検証するフォームのID。
 * @returns {boolean} 全ての入力が有効な場合はtrue、一つでも無効なものがあればfalse。
 */
function validateForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return false;
    
    let isFormValid = true;
    const inputs = form.querySelectorAll('input[type="number"], input[type="text"]');
    
    inputs.forEach(input => {
        // 表示されている入力フィールドのみを検証対象とする
        if (input.offsetParent !== null) {
            if (!validateInput(input, form)) {
                isFormValid = false;
            }
        }
    });

    return isFormValid;
}


// --- モーダル制御と機能計算ロジック ---

/**
 * 指定されたIDのモーダルウィンドウを開きます。
 * @param {string} modalId - 開くモーダルのID。
 */
function openModal(modalId) {
    const modal = document.getElementById(`modal-${modalId}`);
    if (modal) {
        modal.classList.remove('hidden');
        const content = modal.querySelector('.modal-content');
        // 表示アニメーション
        setTimeout(() => {
            modal.style.opacity = 1;
            content.style.opacity = 1;
            content.style.transform = 'translateY(0) scale(1)';
        }, 10);
    }
}

/**
 * 指定されたIDのモーダルウィンドウを閉じます。
 * @param {string} modalId - 閉じるモーダルのID。
 */
function closeModal(modalId) {
    const modal = document.getElementById(`modal-${modalId}`);
    if (modal) {
        // 閉じる際に、表示中のエラーメッセージやツールチップも全て隠す
        const tooltips = modal.querySelectorAll('.tooltip, .validation-tooltip');
        tooltips.forEach(tooltip => tooltip.classList.add('hidden'));
        const inputs = modal.querySelectorAll('.input-error');
        inputs.forEach(input => input.classList.remove('input-error'));

        // 非表示アニメーション
        const content = modal.querySelector('.modal-content');
        modal.style.opacity = 0;
        content.style.opacity = 0;
        content.style.transform = 'translateY(20px) scale(0.95)';
        setTimeout(() => modal.classList.add('hidden'), 200);
    }
}

/**
 * 要素の表示/非表示を切り替えます。
 * @param {string} elementId - 対象要素のID。
 * @param {boolean} condition - trueなら表示、falseなら非表示。
 */
function toggleVis(elementId, condition) {
    document.getElementById(elementId).classList.toggle('hidden', !condition);
}

/**
 * 圧力単位（MPa ⇔ kgf/cm²）が変更された時の処理。
 * @param {HTMLInputElement} radio - 選択されたラジオボタン要素。
 */
function handleUnitChange(radio) {
    const MPA_TO_KGF = 10.19716;
    const KGF_TO_MPA = 0.0980665;
    
    const inputGroup = radio.closest('.input-group');
    if (!inputGroup) return;

    const numberInput = inputGroup.querySelector('input[type=number]');
    if (!numberInput) return;

    let currentValue = parseFloat(numberInput.value);
    if (isNaN(currentValue)) return;

    // 選択された単位に応じて数値を変換し、検証ルールとプレースホルダーも切り替える
    if (radio.value === 'K/C') { // kgf/cm²へ変更
        numberInput.value = (currentValue * MPA_TO_KGF).toFixed(2);
        if (numberInput.dataset.kgcRules) {
            numberInput.dataset.validate = numberInput.dataset.kgcRules;
        }
        if (numberInput.dataset.kgcPlaceholder) {
            numberInput.placeholder = numberInput.dataset.kgcPlaceholder;
        }
    } else { // MPaへ変更
        numberInput.value = (currentValue * KGF_TO_MPA).toFixed(3);
        if (numberInput.dataset.mpaRules) {
            numberInput.dataset.validate = numberInput.dataset.mpaRules;
        }
        if (numberInput.dataset.mpaPlaceholder) {
            numberInput.placeholder = numberInput.dataset.mpaPlaceholder;
        }
    }
    
    // 新しいルールで再検証
    validateInput(numberInput, numberInput.form);
}


/**
 * '計算'ボタンが押された時の処理。バックエンドに計算リクエストを送信します。
 * @param {string} functionId - 実行する計算機能のID (例: 'P0', 'P1')。
 */
async function executeCalculation(functionId) {
    const formId = `form-${functionId}`;
    // 計算実行前にフォーム全体の入力値を検証
    if (!validateForm(formId)) {
        updateSubDisplay('入力値を確認してください', true);
        return;
    }

    // フォームデータを収集してJSONオブジェクトに変換
    const form = document.getElementById(formId);
    const formData = new FormData(form);
    const params = {};
    for (let [key, value] of formData.entries()) {
        params[key] = value;
    }

    // バックエンドの計算ロジックはkgf/cm²を基準としているため、MPaで入力された圧力値を換算
    const MPA_TO_KGF = 10.19716;
    const pressureFieldMap = {
        'pressure': 'pressure_unit', 'p1': 'p1_unit', 'p2': 'p2_unit',
        'p1_bleed': 'p1_bleed_unit', 'supply_pressure': 'supply_pressure_unit',
        'target_pressure': 'target_pressure_unit', 'initial_pressure': 'initial_pressure_unit'
    };
    for (const fieldName in pressureFieldMap) {
        if (params[fieldName] && params[fieldName] !== '') {
            const unitFieldName = pressureFieldMap[fieldName];
            if (params[unitFieldName] === 'MPa') {
                params[fieldName] = parseFloat(params[fieldName]) * MPA_TO_KGF;
            }
        }
    }
    
    // P3（空気消費量）の場合は、複数のシリンダデータを配列としてまとめる
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
        // バックエンドAPIにリクエストを送信
        const response = await fetch(`${BACKEND_URL}/calculate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ functionId, params }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `サーバーエラー: ${response.status}`);
        }

        const result = await response.json();

        // 結果の圧力値を、ユーザーが選択していた単位に戻して表示
        const KGF_TO_MPA = 0.0980665;
        const primaryUnitRadio = form.querySelector('input[name$="_unit"]:checked');
        const primaryUnit = primaryUnitRadio ? primaryUnitRadio.value : 'MPa';
        if (functionId === 'SP2' && result["圧力損失"]) {
            let valueKgc = parseFloat(result["圧力損失"]);
            result["圧力損失"] = primaryUnit === 'MPa' 
                ? `${(valueKgc * KGF_TO_MPA).toFixed(3)} MPa`
                : `${valueKgc.toFixed(2)} kgf/cm²`;
        }
        if ((functionId === 'SP3' || functionId === 'SP4') && result["T秒後の圧力"]) {
            let valueKgc = parseFloat(result["T秒後の圧力"]);
             result["T秒後の圧力"] = primaryUnit === 'MPa'
                ? `${(valueKgc * KGF_TO_MPA).toFixed(3)} MPa`
                : `${valueKgc.toFixed(2)} kgf/cm²`;
        }
        
        displayCalculationResult(functionId, result);
        closeModal(functionId);
    } catch (e) {
        console.error("Calculation Error in " + functionId, e);
        updateSubDisplay("計算エラー: " + e.message, true);
    }
}

/**
 * 計算結果をサブディスプレイに表示します。
 * @param {string} functionId - 実行された計算機能のID。
 * @param {object} data - バックエンドから返された計算結果データ。
 */
function displayCalculationResult(functionId, data) {
    clearDisplay('all');
    displayArea.classList.add('function-result-mode'); // 結果表示モードに切り替え
    
    let resultText;
    // P1機能の場合、PUSHとPULLの結果を分けて表示
    if (functionId === 'P1') {
        const pushEntries = Object.entries(data).filter(([key]) => key.startsWith('PUSH'));
        const pullEntries = Object.entries(data).filter(([key]) => key.startsWith('PULL'));

        // PUSH結果のフォーマット
        const pushText = pushEntries.map(([key, value], index) => {
            const cleanKey = key.replace('PUSH ', '');
            // 1行目のみタイトルを付加
            return index === 0 ? `ーPUSHー${cleanKey}: ${value}` : `${cleanKey}: ${value}`;
        }).join('\n');

        // PULL結果のフォーマット
        const pullText = pullEntries.map(([key, value], index) => {
            const cleanKey = key.replace('PULL ', '');
            // 1行目のみタイトルを付加
            return index === 0 ? `ーPULLー${cleanKey}: ${value}` : `${cleanKey}: ${value}`;
        }).join('\n');

        // --- 変更箇所 ---
        // PUSHとPULLの結果を改行1つで結合 (両方存在する場合のみ改行)
        resultText = [pushText, pullText].filter(Boolean).join('\n');
        // --- 変更ここまで ---
    } else {
        // それ以外の機能は従来通り表示
        resultText = Object.entries(data).map(([key, value]) => `${key}: ${value}`).join('\n');
    }
    
    subDisplayContent.textContent = resultText;
    subDisplayContent.style.transform = `translateY(0px)`;
    subDisplayScrollTop = 0;

    // コンテンツがコンテナより大きい場合はスクロールインジケーターを表示
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

/**
 * サブディスプレイのスクロール位置を更新し、インジケーターの表示/非表示を制御します。
 */
function updateSubDisplayScroll() {
    subDisplayContent.style.transform = `translateY(-${subDisplayScrollTop}px)`;
    scrollUpIndicator.style.visibility = subDisplayScrollTop > 0 ? 'visible' : 'hidden';
    const maxScroll = Math.max(0, subDisplayContent.scrollHeight - subDisplayContainer.clientHeight);
    scrollDownIndicator.style.visibility = subDisplayScrollTop < maxScroll ? 'visible' : 'hidden';
}

// --- HTML動的生成ヘルパー関数 ---

/**
 * モーダルウィンドウの基本構造となるHTML文字列を生成します。
 * @param {string} id - モーダルのID。
 * @param {string} title - モーダルのタイトル。
 * @param {string} content - モーダルの主要コンテンツとなるHTML。
 * @param {string} [tooltipContent=''] - モーダル内で使用するツールチップのHTML。
 * @returns {string} 生成されたHTML文字列。
 */
function createModal(id, title, content, tooltipContent = '') {
    return `
        <div id="modal-${id}" class="modal absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 hidden">
            <div class="modal-content relative bg-gray-100 rounded-lg shadow-xl w-full max-w-sm p-6 border-2 border-gray-300">
                <form id="form-${id}" novalidate>
                    <h2 class="text-xl font-bold mb-4 text-gray-800">${title}</h2>
                    <div class="space-y-3 text-sm">${content}</div>
                    <div class="mt-6 flex justify-end space-x-3">
                        <button type="button" data-action="closeModal" data-modal-id="${id}" class="key bg-gray-300 text-gray-800 px-4 py-2 font-medium">キャンセル</button>
                        <button type="button" data-action="executeCalculation" data-modal-id="${id}" class="key bg-blue-600 text-white px-4 py-2 font-bold">計算</button>
                    </div>
                </form>
                ${tooltipContent}
            </div>
        </div>`;
}

/**
 * 検証機能付きの数値入力フィールドのHTML文字列を生成します。
 * @param {string} name - input要素のname属性。
 * @param {string} label - ラベルのテキスト。
 * @param {string} placeholder - プレースホルダーテキスト。
 * @param {string} value - 初期値。
 * @param {string} rules - data-validate属性に設定する検証ルール。
 * @param {string|null} [tooltipTarget=null] - ツールチップを表示する場合、そのIDセレクタ。
 * @returns {string} 生成されたHTML文字列。
 */
function createValidatedInput(name, label, placeholder, value, rules, tooltipTarget = null) {
    const labelAttributes = tooltipTarget 
        ? `class="input-label cursor-pointer" data-action="toggleTooltip" data-tooltip-target="${tooltipTarget}"` 
        : `class="input-label"`;
    
    return `
        <div class="input-group">
            <label ${labelAttributes}>${label}</label>
            <input type="number" name="${name}" class="input-field" placeholder="${placeholder}" value="${value}" step="any" data-validate="${rules}">
            <span class="validation-tooltip hidden"></span>
        </div>
    `;
}

/**
 * 単位切り替え機能付きの圧力入力フィールドのHTML文字列を生成します。
 * @param {string} name - input要素のname属性。
 * @param {string} label - ラベルのテキスト。
 * @param {string} defaultValueMpa - MPa単位での初期値。
 * @param {string} unitName - 単位選択ラジオボタンのname属性。
 * @param {string} mpaRules - MPa単位時の検証ルール。
 * @param {string} kgcRules - kgf/cm²単位時の検証ルール。
 * @returns {string} 生成されたHTML文字列。
 */
function createPressureInput(name, label, defaultValueMpa, unitName, mpaRules, kgcRules) {
    const mpaPlaceholder = mpaRules.match(/min:([\d.]+)\|max:([\d.]+)/) ? mpaRules.match(/min:([\d.]+)\|max:([\d.]+)/).slice(1, 3).join('～') : '数値を入力';
    const kgcPlaceholder = kgcRules.match(/min:([\d.]+)\|max:([\d.]+)/) ? kgcRules.match(/min:([\d.]+)\|max:([\d.]+)/).slice(1, 3).join('～') : '数値を入力';

    return `
        <div class="input-group">
            <label class="input-label">${label}</label>
            <div class="flex items-center mt-1">
                <div class="flex-grow relative">
                    <input type="number" name="${name}" class="input-field" 
                           value="${defaultValueMpa}" 
                           placeholder="${mpaPlaceholder}"
                           step="any" 
                           data-validate="${mpaRules}"
                           data-mpa-rules="${mpaRules}"
                           data-kgc-rules="${kgcRules}"
                           data-mpa-placeholder="${mpaPlaceholder}"
                           data-kgc-placeholder="${kgcPlaceholder}">
                    <span class="validation-tooltip hidden"></span>
                </div>
                <div class="text-xs pl-2 flex-shrink-0 space-y-1">
                    <label class="flex items-center"><input type="radio" name="${unitName}" value="MPa" checked> <span class="pl-1">MPa</span></label>
                    <label class="flex items-center"><input type="radio" name="${unitName}" value="K/C"> <span class="pl-1">kgf/cm²</span></label>
                </div>
            </div>
        </div>
    `;
}

/**
 * JIS Bロッド径の参照表ツールチップ用HTMLを生成します。
 * @returns {string} 生成されたHTML文字列。
 */
function createJISTableHTML() {
    const jisData = [
        { bore: 40, rod: 16 }, { bore: 50, rod: 20 }, { bore: 63, rod: 20 },
        { bore: 80, rod: 25 }, { bore: 100, rod: 32 }, { bore: 125, rod: 36 },
        { bore: 140, rod: 36 }, { bore: 160, rod: 40 }, { bore: 180, rod: 45 }
    ];
    const tableHeader = `<thead><tr><th class="px-2 py-1">シリンダ内径</th><th class="px-2 py-1">ロッド径</th></tr></thead>`;
    const tableBody = `<tbody>${jisData.map(d => `<tr><td class="text-center px-2 py-1">${d.bore}</td><td class="text-center px-2 py-1">${d.rod}</td></tr>`).join('')}</tbody>`;
    return `<h4 class="font-bold text-center mb-2">JIS Bロッド径 (mm)</h4><table class="w-full text-xs">${tableHeader}${tableBody}</table>`;
}

/**
 * 鋼管内径の参照表ツールチップ用HTMLを生成します。
 * @returns {string} 生成されたHTML文字列。
 */
function createSteelPipeTableHTML() {
    const pipeData = [
        { call: 6, inner: 6.5 }, { call: 8, inner: 9.2 }, { call: 10, inner: 12.7 },
        { call: 15, inner: 16.1 }, { call: 20, inner: 21.6 }, { call: 25, inner: 27.6 },
        { call: 32, inner: 35.7 }, { call: 40, inner: 41.6 }, { call: 50, inner: 52.9 },
        { call: 65, inner: 67.9 }, { call: 80, inner: 80.7 }, { call: 90, inner: 93.2 }
    ];
    const tableHeader = `<thead><tr><th class="px-2 py-1">呼び径(A)</th><th class="px-2 py-1">内径(mm)</th></tr></thead>`;
    const tableBody = `<tbody>${pipeData.map(d => `<tr><td class="text-center px-2 py-1">${d.call}</td><td class="text-center px-2 py-1">${d.inner}</td></tr>`).join('')}</tbody>`;
    return `<h4 class="font-bold text-center mb-2">鋼管内径</h4><table class="w-full text-xs">${tableHeader}${tableBody}</table>`;
}

/**
 * 全ての機能計算モーダルを生成し、DOMに追加します。
 */
function createAllModals() {
    const modalContainer = document.getElementById('modal-container');

    // 各種ツールチップのHTMLを生成する関数を定義
    const jisTooltip = (id) => `<div id="${id}" class="tooltip absolute bg-white p-3 rounded-lg shadow-lg border border-gray-300 z-50 hidden" style="width: 200px;">${createJISTableHTML()}</div>`;
    const steelPipeTooltip = (id) => `<div id="${id}" class="tooltip absolute bg-white p-3 rounded-lg shadow-lg border border-gray-300 z-50 hidden" style="width: 200px;">${createSteelPipeTableHTML()}</div>`;
    const frictionTooltip = (id) => `<div id="${id}" class="tooltip absolute bg-white p-4 rounded-lg shadow-lg border border-gray-300 z-50 hidden" style="width: 280px;"><h4 class="font-bold text-center mb-2">摩擦係数について</h4><p class="text-xs text-left leading-relaxed">ころがりの場合 U=0.1<br>すべりの場合 U=0.4<br>上方向動作の場合は U=1 に相当します。</p></div>`;
    const loadRateTooltip = (id) => `<div id="${id}" class="tooltip absolute bg-white p-4 rounded-lg shadow-lg border border-gray-300 z-50 hidden" style="width: 280px;"><h4 class="font-bold text-center mb-2">負荷率について</h4><p class="text-xs text-left leading-relaxed">重量物をシリンダでスムーズに移動させるには、負荷を70％以下に抑える必要があります。<br>一般的には、負荷率50％程度で使用するのが標準的です。<br>重量物を高スピードで移動さえる場合は、負荷率が低めになるシリンダ径を選定して使用します。</p></div>`;

    // 各機能のモーダルHTMLをテンプレートリテラルで定義
    modalContainer.innerHTML = `
        ${createModal('P0', 'シリンダ出力と負荷率', `
            <div data-change-handler="toggleP0">
                <label class="flex items-center"><input type="radio" name="type" value="output" checked><span class="ml-2">出力のみ</span></label>
                <label class="flex items-center"><input type="radio" name="type" value="load_rate"><span class="ml-2">負荷率も計算</span></label>
            </div>
            <hr class="my-2">
            ${createPressureInput('pressure', '作動圧力', '0.4', 'pressure_unit', 'required|min:0.02|max:0.99', 'required|min:0.2|max:9.99')}
            
            <div class="input-group">
                <label class="input-label cursor-pointer" data-action="toggleTooltip" data-tooltip-target="#p0-jis-tooltip">シリンダ内径 (mm) ⓘ</label>
                <input type="number" name="cylinder_diameter" class="input-field" placeholder="正の数" value="63" data-validate="required|min:1">
                <span class="validation-tooltip hidden"></span>
            </div>
            <div class="input-group">
                <label class="input-label cursor-pointer" data-action="toggleTooltip" data-tooltip-target="#p0-jis-tooltip">ロッド径 (mm) ⓘ</label>
                <input type="number" name="rod_diameter" class="input-field" placeholder="内径未満の正の数" value="24" data-validate="required|min:1|lessThan:cylinder_diameter">
                <span class="validation-tooltip hidden"></span>
            </div>

            <hr class="my-2">
            <div class="input-group">
                <label class="input-label">出力単位</label>
                <div class="flex items-center space-x-4 mt-1">
                    <label class="flex items-center"><input type="radio" name="output_unit" value="KGF" checked><span class="ml-2">KGF (重量キログラム)</span></label>
                    <label class="flex items-center"><input type="radio" name="output_unit" value="N"><span class="ml-2">N (ニュートン)</span></label>
                </div>
            </div>
            <div id="p0-load-inputs" class="space-y-3 pl-5 hidden">
                ${createValidatedInput('load_weight', '負荷の重量 (Kgf)', '正の数', '200', 'required|min:0')}
                ${createValidatedInput('load_friction', '摩擦係数 ⓘ', '0～1', '0.3', 'required|min:0|max:1', '#p0-friction-tooltip')}
            </div>
        `, `${jisTooltip('p0-jis-tooltip')}${frictionTooltip('p0-friction-tooltip')}`)}
        
        ${createModal('P1', '運動（動作時間・必要S）', `
            <div data-change-handler="toggleP1">
                <label class="flex items-center"><input type="radio" name="type" value="time" checked><span class="ml-2">動作時間を計算</span></label>
                <label class="flex items-center"><input type="radio" name="type" value="necessary_s"><span class="ml-2">必要有効断面積を計算</span></label>
            </div>
            
            <div class="input-group">
                <label class="input-label">計算対象</label>
                <div class="flex space-x-4 mt-1">
                    <label class="flex items-center"><input type="checkbox" name="calc_push" value="true" checked><span class="ml-2">PUSH</span></label>
                    <label class="flex items-center"><input type="checkbox" name="calc_pull" value="true" checked><span class="ml-2">PULL</span></label>
                </div>
            </div>
            <hr class="my-2">
            
            <div id="p1-time-inputs-container">
                <div data-change-handler="toggleP1SInput">
                    <label class="flex items-center"><input type="radio" name="s_input_type" value="direct" checked><span class="ml-2">合成有効断面積を直接入力</span></label>
                    <label class="flex items-center"><input type="radio" name="s_input_type" value="calculate"><span class="ml-2">各機器のSから計算</span></label>
                </div>
                <div id="p1-s-direct-input">
                    ${createValidatedInput('s_composite', '合成有効断面積S (mm²)', '正の数', '5.68', 'required|min:0.01')}
                </div>
                <div id="p1-s-calculate-inputs" class="hidden space-y-3">
                    ${createValidatedInput('valve_s', 'バルブのS (mm²)', '正の数', '10', 'required|min:0.01')}
                    ${createValidatedInput('spicon_s', 'スピコンのS (mm²)', '正の数', '8', 'required|min:0.01')}
                    ${createValidatedInput('silencer_s', 'サイレンサのS (mm²)', '正の数', '15', 'required|min:0.01')}
                </div>
            </div>
            
            <div id="p1-s-inputs" class="hidden">
                 ${createValidatedInput('time', '目標動作時間 (sec)', '正の数', '0.8', 'required|min:0.01')}
            </div>

            <div data-change-handler="toggleP1PipeInput">
                <label class="flex items-center"><input type="radio" name="pipe_volume_input_type" value="direct" checked><span class="ml-2">配管容積を直接入力</span></label>
                <label class="flex items-center"><input type="radio" name="pipe_volume_input_type" value="calculate"><span class="ml-2">配管の内径と長さから計算</span></label>
            </div>
            <div id="p1-pipe-volume-direct-inputs">
                 ${createValidatedInput('pipe_volume', '配管容積 ΔV (cm³)', '正の数', '50', 'required|min:0')}
            </div>
            <div id="p1-pipe-volume-calculate-inputs" class="hidden space-y-3">
                ${createValidatedInput('p1_pipe_length', '配管の長さ (m)', '0.3～10', '1', 'required|min:0.3|max:10')}
                <div class="input-group"><label class="input-label">配管種類</label><select name="p1_pipe_type" class="input-field"><option value="nylon">ナイロンチューブ</option><option value="steel">鋼管</option></select></div>
                <div class="input-group">
                    <label class="input-label cursor-pointer" data-action="toggleTooltip" data-tooltip-target="#p1-steel-pipe-tooltip">配管の内径 (mm) ⓘ</label>
                    <input type="number" name="p1_pipe_diameter" class="input-field" placeholder="正の数" value="8" data-validate="required|min:1">
                    <span class="validation-tooltip hidden"></span>
                </div>
            </div>
            <hr class="my-2">
            
            <div class="input-group" data-change-handler="toggleP1LoadInput">
                <label class="input-label">負荷の入力方法</label>
                <div class="text-xs space-y-1 mt-1">
                    <label class="flex items-center"><input type="radio" name="load_input_type" value="weight_friction" checked><span class="pl-1">重量と摩擦係数</span></label>
                    <label class="flex items-center"><input type="radio" name="load_input_type" value="value"><span class="pl-1">負荷の値</span></label>
                    <label class="flex items-center"><input type="radio" name="load_input_type" value="rate"><span class="pl-1">負荷率</span></label>
                </div>
            </div>
            <div id="p1-load-weight-friction-inputs" class="space-y-3">
                ${createValidatedInput('load_weight', '負荷重量 (Kgf)', '正の数', '49', 'required|min:0')}
                ${createValidatedInput('load_friction', '摩擦係数 ⓘ', '0～1', '0.4', 'required|min:0|max:1', '#p1-friction-tooltip')}
            </div>
            <div id="p1-load-value-input" class="hidden">
                 ${createValidatedInput('load_value', '負荷の値 (Kgf)', '正の数', '20', 'required|min:0')}
            </div>
            <div id="p1-load-rate-input" class="hidden">
                <div class="input-group">
                    <label class="input-label cursor-pointer" data-action="toggleTooltip" data-tooltip-target="#p1-load-rate-tooltip">負荷率 (%) ⓘ</label>
                    <input type="number" name="load_rate" class="input-field" placeholder="1～99" value="50" data-validate="required|min:1|max:99">
                    <span class="validation-tooltip hidden"></span>
                </div>
            </div>
            <hr class="my-2">

            <div class="input-group" data-change-handler="toggleP1OrificeInput">
                <label class="input-label">シリンダ接続口シボリ</label>
                <div class="text-xs space-y-1 mt-1">
                    <label class="flex items-center"><input type="radio" name="has_orifice" value="no" checked><span class="pl-1">無し</span></label>
                    <label class="flex items-center"><input type="radio" name="has_orifice" value="yes"><span class="pl-1">有り</span></label>
                </div>
            </div>
            <div id="p1-orifice-input" class="hidden">
                 ${createValidatedInput('orifice_diameter', 'オリフィス径 (mm)', '正の数', '4', 'required|min:0.1')}
            </div>

            ${createPressureInput('pressure', '作動圧力', '0.5', 'pressure_unit', 'required|min:0.02|max:0.99', 'required|min:0.2|max:9.99')}
            ${createValidatedInput('cylinder_diameter', 'シリンダ内径 (mm) ⓘ', '正の数', '50', 'required|min:1', '#p1-jis-tooltip')}
            ${createValidatedInput('rod_diameter', 'ロッド径 (mm) ⓘ', '内径未満', '20', 'required|min:1|lessThan:cylinder_diameter', '#p1-jis-tooltip')}
            ${createValidatedInput('stroke', 'ストローク (mm)', '正の数', '300', 'required|min:1')}
        `, `${jisTooltip('p1-jis-tooltip')}${steelPipeTooltip('p1-steel-pipe-tooltip')}${frictionTooltip('p1-friction-tooltip')}${loadRateTooltip('p1-load-rate-tooltip')}`)}

         ${createModal('P2', '有効断面積', `
            <div data-change-handler="toggleP2">
                <label class="flex items-center"><input type="radio" name="type" value="pipe" checked><span class="ml-2">配管のS</span></label>
                <label class="flex items-center"><input type="radio" name="type" value="composite"><span class="ml-2">Sの合成</span></label>
            </div>
            <hr class="my-2">
            <div id="p2-pipe-inputs">
                ${createValidatedInput('pipe_length', '配管長さ (m)', '0.3～10', '3', 'required|min:0.3|max:10')}
                <div class="input-group"><label class="input-label">配管種類</label><select name="pipe_type" class="input-field"><option value="steel">鋼管</option><option value="nylon">ナイロンチューブ</option></select></div>
                ${createValidatedInput('pipe_diameter', '配管内径 (mm) ⓘ', '正の数', '16.1', 'required|min:1', '#p2-steel-pipe-tooltip')}
            </div>
            <div id="p2-composite-inputs" class="hidden">
                <div class="input-group">
                    <label class="input-label">各有効断面積 (カンマ区切り)</label>
                    <input type="text" name="s_values" class="input-field" placeholder="例: 15,8,20" value="15,8,20" data-validate="required">
                    <span class="validation-tooltip hidden"></span>
                </div>
            </div>
        `, steelPipeTooltip('p2-steel-pipe-tooltip'))}
        ${createModal('P3', '空気消費量', `
            ${createPressureInput('pressure', '作動圧力', '0.4', 'pressure_unit', 'required|min:0.02|max:0.99', 'required|min:0.2|max:9.99')}
            <div class="input-group">
                <label class="input-label">シリンダの本数</label>
                <input type="number" name="num_cylinders" class="input-field" placeholder="1以上の整数" value="2" data-change-handler="generateCylinders" data-validate="required|min:1|integer">
                <span class="validation-tooltip hidden"></span>
            </div>
            <div id="p3-cylinder-inputs" class="space-y-4"></div>
        `, steelPipeTooltip('p3-steel-pipe-tooltip'))}
        ${createModal('P4', '流量', `
            <div data-change-handler="toggleP4">
                <label class="flex items-center"><input type="radio" name="type" value="flow" checked><span class="ml-2">流量</span></label>
                <label class="flex items-center"><input type="radio" name="type" value="bleed"><span class="ml-2">ブリード量</span></label>
            </div>
            <hr class="my-2">
            <div id="p4-flow-inputs">
                ${createPressureInput('p1', '1次側圧力', '0.5', 'p1_unit', 'required|min:0.02|max:0.99', 'required|min:0.2|max:9.99')}
                ${createPressureInput('p2', '2次側圧力', '0.38', 'p2_unit', 'required|min:0|lessThan:p1', 'required|min:0|lessThan:p1')}
                ${createValidatedInput('s', '絞り部のS (mm²)', '正の数', '10', 'required|min:0.01')}
            </div>
            <div id="p4-bleed-inputs" class="hidden">
                ${createPressureInput('p1_bleed', '圧力', '0.3', 'p1_bleed_unit', 'required|min:0.02|max:0.99', 'required|min:0.2|max:9.99')}
                ${createValidatedInput('nozzle_diameter', 'ノズル内径 (mm)', '正の数', '0.8', 'required|min:0.1')}
            </div>
        `)}
        ${createModal('P5', '三角関数', `
            <div class="input-group"><label class="input-label">関数</label><select name="func" class="input-field" data-change-handler="validateP5"><option value="sin">sin</option><option value="cos">cos</option><option value="tan">tan</option><option value="asin">asin</option><option value="acos">acos</option><option value="atan">atan</option></select></div>
            <div class="input-group">
                <label class="input-label">値 (角度 or -1~1)</label>
                <input type="number" name="value" class="input-field" placeholder="数値を入力" value="40" data-validate="required">
                <span class="validation-tooltip hidden"></span>
            </div>
        `)}
        ${createModal('P6', '対数', `
            <div class="input-group"><label class="input-label">関数</label><select name="func" class="input-field"><option value="log10">log10</option><option value="loge">loge</option></select></div>
            ${createValidatedInput('value', '値', '正の数', '5230', 'required|min:0.000001')}
        `)}
        ${createModal('SP2', '配管の圧力損失', `
            ${createPressureInput('pressure', '元圧力', '0.7', 'pressure_unit', 'required|min:0.02|max:0.99', 'required|min:0.2|max:9.99')}
            ${createValidatedInput('flow', '流量 (l/min)', '正の数', '5000', 'required|min:1')}
            ${createValidatedInput('length', '配管長さ (m)', '正の数', '30', 'required|min:0.1')}
            ${createValidatedInput('diameter', '配管内径 (mm) ⓘ', '正の数', '27.6', 'required|min:1', '#sp2-steel-pipe-tooltip')}
        `, steelPipeTooltip('sp2-steel-pipe-tooltip'))}
        ${createModal('SP3', 'タンクへの空気圧の充填', `
            <div data-change-handler="toggleSP3">
                <label><input type="radio" name="type" value="fill_time_full" checked> 充填完了時間</label><br>
                <label><input type="radio" name="type" value="fill_time_to_p"> Pまで上昇する時間</label><br>
                <label><input type="radio" name="type" value="pressure_after_t"> T秒後の圧力</label>
            </div>
            <hr class="my-2">
            ${createPressureInput('supply_pressure', '供給圧力', '0.3', 'supply_pressure_unit', 'required|min:0.02|max:0.99', 'required|min:0.2|max:9.99')}
            ${createValidatedInput('volume', 'タンク容積 (l)', '正の数', '20', 'required|min:0.1')}
            ${createValidatedInput('s', '絞り部のS (mm²)', '正の数', '12', 'required|min:0.01')}
            <div id="sp3-p-input" class="hidden">${createPressureInput('target_pressure', '目標圧力 P', '0.25', 'target_pressure_unit', 'required|min:0|lessThan:supply_pressure', 'required|min:0|lessThan:supply_pressure')}</div>
            <div id="sp3-t-input" class="hidden">${createValidatedInput('fill_time', '充填時間 T (sec)', '正の数', '3', 'required|min:0.01')}</div>
        `)}
        ${createModal('SP4', 'タンクからの空気圧の放出', `
             <div data-change-handler="toggleSP4">
                <label><input type="radio" name="type" value="release_time_full" checked> 放出完了時間</label><br>
                <label><input type="radio" name="type" value="release_time_to_p"> Pまで下降する時間</label><br>
                <label><input type="radio" name="type" value="pressure_after_t"> T秒後の圧力</label>
            </div>
            <hr class="my-2">
            ${createPressureInput('initial_pressure', '初期圧力', '0.5', 'initial_pressure_unit', 'required|min:0.02|max:0.99', 'required|min:0.2|max:9.99')}
            ${createValidatedInput('volume', 'タンク容積 (l)', '正の数', '60', 'required|min:0.1')}
            ${createValidatedInput('s', '絞り部のS (mm²)', '正の数', '18', 'required|min:0.01')}
            <div id="sp4-p-input" class="hidden">${createPressureInput('target_pressure', '目標圧力 P', '0.4', 'target_pressure_unit', 'required|min:0|lessThan:initial_pressure', 'required|min:0|lessThan:initial_pressure')}</div>
            <div id="sp4-t-input" class="hidden">${createValidatedInput('release_time', '放出時間 T (sec)', '正の数', '2.5', 'required|min:0.01')}</div>
        `)}
    `;
}

/**
 * P3（空気消費量）機能で、指定された本数分のシリンダ入力欄を動的に生成します。
 * @param {number} count - 生成するシリンダの数。
 */
function generateCylinderInputs(count) {
    const container = document.getElementById('p3-cylinder-inputs');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 1; i <= count; i++) {
        container.innerHTML += `
            <div class="cylinder-group border-t pt-2 mt-2">
                <h4 class="font-bold mb-2">シリンダ ${i}</h4>
                ${createValidatedInput('diameter', '内径 (mm)', '正の数', '40', 'required|min:1')}
                ${createValidatedInput('stroke', 'ストローク (mm)', '正の数', '100', 'required|min:1')}
                ${createValidatedInput('frequency', '動作頻度 (回/min)', '正の数', '12', 'required|min:0')}
                ${createValidatedInput('pipe_length', '配管長さ (m)', '正の数', '1', 'required|min:0.1')}
                <div class="input-group">
                    <label class="input-label cursor-pointer" data-action="toggleTooltip" data-tooltip-target="#p3-steel-pipe-tooltip">配管内径 (mm) ⓘ</label>
                    <input type="number" name="pipe_diameter" class="input-field" placeholder="正の数" value="6" data-validate="required|min:1">
                    <span class="validation-tooltip hidden"></span>
                </div>
            </div>
        `;
    }
}

// --- UI補助機能 ---

/**
 * 画面サイズの固定/固定解除を切り替えます。
 */
function toggleSizeLock() {
    isSizeLocked = !isSizeLocked;
    lockIcon.classList.toggle('hidden', isSizeLocked);
    unlockIcon.classList.toggle('hidden', !isSizeLocked);
    if (!isSizeLocked) {
        adjustAppScale();
    }
    updateSubDisplay(isSizeLocked ? '画面サイズ固定 ON' : '画面サイズ固定 OFF', true);
}

/**
 * ウィンドウサイズに合わせて、アプリ全体の表示倍率を調整します。
 */
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

// --- イベントリスナー設定 ---

/**
 * アプリケーション全体のイベントリスナーを設定します。
 * イベント委任（Event Delegation）を用いて、親要素でイベントを一括して捕捉します。
 */
function setupEventListeners() {
    const appContainer = document.getElementById('app-container');

    // --- クリックイベントの委任 ---
    appContainer.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action]');
        if (!button) return;

        // ツールチップ表示/非表示の処理
        if (button.dataset.action === 'toggleTooltip') {
            const targetSelector = button.dataset.tooltipTarget;
            const tooltip = document.querySelector(targetSelector);
            if (tooltip) {
                const isHidden = tooltip.classList.contains('hidden');
                // 他のツールチップを全て隠す
                document.querySelectorAll('.tooltip').forEach(tt => tt.classList.add('hidden'));
                // 対象が隠れていたら表示する
                if (isHidden) {
                    const modalContent = tooltip.closest('.modal-content');
                    if (modalContent) {
                        // ツールチップをモーダルの中央に配置
                        const topPosition = modalContent.scrollTop + (modalContent.clientHeight / 2);
                        tooltip.style.top = `${topPosition}px`;
                        tooltip.style.left = '50%';
                        tooltip.style.transform = 'translate(-50%, -50%)';
                    }
                    tooltip.classList.remove('hidden');
                }
            }
            return;
        }

        event.stopPropagation(); // 他のクリックイベントへの伝播を停止

        const { action, value, modalId } = button.dataset;

        // data-action属性の値に応じて処理を分岐
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

    // --- changeイベントの委任（ラジオボタンやセレクトボックスの変更） ---
    appContainer.addEventListener('change', (event) => {
        const element = event.target;
        
        // 圧力単位の変更
        if (element.matches('input[type="radio"][name$="_unit"]')) {
            handleUnitChange(element);
        }

        // モーダル内のUIを動的に切り替える処理
        const changeHandler = element.closest('[data-change-handler]');
        if (changeHandler) {
            const handlerName = changeHandler.dataset.changeHandler;
            switch (handlerName) {
                case 'toggleP0':
                    toggleVis('p0-load-inputs', element.value === 'load_rate');
                    break;
                case 'toggleP1':
                    toggleVis('p1-time-inputs-container', element.value === 'time');
                    toggleVis('p1-s-inputs', element.value === 'necessary_s');
                    break;
                case 'toggleP1PipeInput':
                    toggleVis('p1-pipe-volume-direct-inputs', element.value === 'direct');
                    toggleVis('p1-pipe-volume-calculate-inputs', element.value === 'calculate');
                    break;
                case 'toggleP1SInput':
                    toggleVis('p1-s-direct-input', element.value === 'direct');
                    toggleVis('p1-s-calculate-inputs', element.value === 'calculate');
                    break;
                case 'toggleP1LoadInput':
                    toggleVis('p1-load-weight-friction-inputs', element.value === 'weight_friction');
                    toggleVis('p1-load-value-input', element.value === 'value');
                    toggleVis('p1-load-rate-input', element.value === 'rate');
                    break;
                case 'toggleP1OrificeInput':
                    toggleVis('p1-orifice-input', element.value === 'yes');
                    break;
                case 'toggleP2':
                    toggleVis('p2-pipe-inputs', element.value === 'pipe');
                    toggleVis('p2-composite-inputs', element.value === 'composite');
                    break;
                case 'generateCylinders':
                    if (validateInput(element, element.form)) {
                        generateCylinderInputs(element.value);
                    }
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
                case 'validateP5':
                    const valueInput = element.form.querySelector('[name="value"]');
                    if (element.value === 'asin' || element.value === 'acos') {
                        valueInput.dataset.validate = 'required|min:-1|max:1';
                        valueInput.placeholder = '-1 ~ 1';
                    } else {
                        valueInput.dataset.validate = 'required';
                        valueInput.placeholder = '角度';
                    }
                    validateInput(valueInput, element.form);
                    break;
            }
        }
    });
    
    // --- inputイベントの委任（リアルタイム入力検証） ---
    appContainer.addEventListener('input', (event) => {
        const input = event.target;
        // data-validate属性を持つ入力フィールドの場合、入力のたびに検証を実行
        if (input.matches('input[type="number"], input[type="text"]') && input.dataset.validate) {
            validateInput(input, input.form);
        }
    }, true); // キャプチャフェーズでイベントを捕捉

    // --- フィードバックリンクのクリック処理 ---
    const feedbackLink = document.getElementById('feedback-link');
    if (feedbackLink) {
        feedbackLink.addEventListener('click', async (event) => {
            event.preventDefault(); // デフォルトのリンク遷移をキャンセル
            try {
                // バックエンドからフィードバックフォームのURLを取得して開く
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

    // --- ドキュメント全体のクリック処理（ツールチップを閉じるため） ---
    document.addEventListener('click', (event) => {
        const tooltip = document.querySelector('.tooltip:not(.hidden)');
        // ツールチップ本体と、それを開くためのⓘアイコン以外がクリックされたらツールチップを閉じる
        if (tooltip && !tooltip.contains(event.target) && !event.target.closest('[data-action="toggleTooltip"]')) {
            tooltip.classList.add('hidden');
        }
    });
}

// --- アプリケーションの初期化 ---

// HTMLドキュメントの読み込みが完了したら実行
document.addEventListener('DOMContentLoaded', () => {
    // 検証エラーやツールチップ用のスタイルを動的に追加
    const style = document.createElement('style');
    style.textContent = `
        .tooltip table, .tooltip th, .tooltip td {
            border: 1px solid #d1d5db; /* border-gray-300 */
            border-collapse: collapse;
        }
        .input-error {
            border-color: #ef4444; /* red-500 */
            box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
        }
        .validation-tooltip {
            color: #dc2626; /* red-600 */
            font-size: 0.75rem; /* 12px */
            margin-top: 0.25rem;
            display: block;
        }
    `;
    document.head.appendChild(style);

    // 初期化処理の実行
    createAllModals();          // 全てのモーダルを生成
    generateCylinderInputs(2);  // P3のシリンダ入力欄をデフォルトで2つ生成
    renderDisplayWithCursor();  // 電卓表示を初期化
    adjustAppScale();           // 画面サイズを調整
    setupEventListeners();      // 全てのイベントリスナーを設定
});

// ウィンドウサイズが変更されたら、再度表示倍率を調整
window.addEventListener('resize', adjustAppScale);