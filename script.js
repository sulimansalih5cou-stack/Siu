// 🔥 تهيئة واستيراد Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// 🛑 إعدادات Firebase (بيانات مشروعك)
const firebaseConfig = {
    apiKey: "AIzaSyA2GNsXj4DzWyCYLKuVT3i1XBKfjX3ccuM",
    authDomain: "siu-students.firebaseapp.com",
    databaseURL: "https://siu-students-default-rtdb.firebaseio.com",
    projectId: "siu-students",
    storageBucket: "siu-students.firebasestorage.app",
    messagingSenderId: "76007314543",
    appId: "1:76007314543:web:4850b668cec4b93bdc699a",
    measurementId: "G-SB6884R2FX"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// ============================================================
// 🌐 المتغيرات العامة (State)
// ============================================================
let allUsers = [];
let currentUserID = null;
let currentUserDB = null;
let allExpenses = [];
let allSettlements = [];
let allNotifications = [];
let netBalances = {}; 

// متغيرات العرض والتسوية
let activeFilter = '30days';
let historyDisplayLimit = 10;
let currentHistoryIndex = 0;
let pendingExpense = null; // للمعاينة قبل الحفظ

// متغيرات المودال للتسوية
let settleTargetUID = null;
let settleTargetName = null;
let settleActionType = null;
let settleMaxAmount = 0;

// ============================================================
// 🛠️ دوال مساعدة عامة
// ============================================================
function getUserNameById(uid) {
    const user = allUsers.find(u => u.uid === uid);
    return user ? user.displayName : 'مستخدم';
}
function roundToTwo(num) { return Math.round(num * 100) / 100; }
window.formatNumber = function(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') input.value = parseFloat(value).toLocaleString('en-US');
};
function formatBankDate(timestamp) {
    if (!timestamp) return { date: '--', time: '--' };
    const dateObj = new Date(timestamp);
    return {
        date: dateObj.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }),
        time: dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })
    };
}

// إغلاق النوافذ المنبثقة
window.hideModal = () => document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
window.hideSuccessModal = () => document.getElementById('successModal')?.classList.remove('show');
window.hideNotificationModal = () => document.getElementById('notificationModal')?.classList.remove('show');
window.hideSettleModal = () => document.getElementById('settleModal')?.classList.remove('show');

// ============================================================
// 🎨 تحديث الواجهة العامة (Header & Notifications)
// ============================================================
function updateCommonUI() {
    const balanceEl = document.getElementById('currentBalance');
    const nameEl = document.getElementById('userNamePlaceholder');
    const cardEl = document.getElementById('currentBalanceCard');
    const sidebarName = document.getElementById('sidebarUserName');
    const sidebarEmail = document.getElementById('sidebarUserEmail');

    // 1. تحديث بيانات المستخدم
    let displayName = "مستخدم";
    let email = "";
    if (currentUserDB) { displayName = currentUserDB.displayName; }
    else if (auth.currentUser) { displayName = auth.currentUser.displayName; email = auth.currentUser.email; }

    if (nameEl) nameEl.textContent = displayName;
    if (sidebarName) sidebarName.textContent = displayName;
    if (sidebarEmail) sidebarEmail.textContent = email;

    // 2. تحديث الرصيد (يعتمد على الحساب التراكمي من netBalances)
    // نعيد حساب الرصيد الصافي الكلي من netBalances التي تم تحديثها
    let totalNetBalance = 0;
    // التأكد من أن netBalances محسوبة
    if (Object.keys(netBalances).length === 0 && allExpenses.length > 0) calculateNetBalances();
    
    for (const uid in netBalances) {
        totalNetBalance += netBalances[uid];
    }

    if (balanceEl && cardEl) {
        balanceEl.textContent = Math.abs(totalNetBalance).toLocaleString('en-US', {minimumFractionDigits: 1});
        if (totalNetBalance < -0.1) {
            cardEl.classList.add('negative');
            cardEl.querySelector('h3').innerHTML = `<i class="fas fa-arrow-down-circle ml-1"></i> دين عليك صافي:`;
        } else {
            cardEl.classList.remove('negative');
            cardEl.querySelector('h3').innerHTML = `<i class="fas fa-arrow-up-circle ml-1"></i> رصيدك المستحق:`;
        }
    }

    // 3. تحديث شارة الإشعارات
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        const unreadCount = allNotifications.filter(n => n.recipientId === currentUserID && !n.read).length;
        badge.style.display = unreadCount > 0 ? 'block' : 'none';
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
    }
}

// ============================================================
// 🏠 منطق الصفحة الرئيسية (إضافة مصروف)
// ============================================================

window.populateParticipants = function() {
    const container = document.getElementById('participantsCheckboxes');
    if (!container) return;
    container.innerHTML = '';

    // المستخدم الحالي (الدافع)
    const currentUser = allUsers.find(u => u.uid === currentUserID);
    if (currentUser) {
        container.innerHTML += `
            <label class="checkbox-item bg-blue-50 border-blue-200">
                <input type="checkbox" id="user_${currentUser.uid}" value="${currentUser.uid}" checked disabled data-name="${currentUser.displayName}">
                <span class="mr-2 text-sm font-bold text-blue-800">${currentUser.displayName} (أنت)</span>
            </label>`;
    }

    // باقي المستخدمين
    allUsers.filter(u => u.uid !== currentUserID).forEach(user => {
        container.innerHTML += `
            <label class="checkbox-item">
                <input type="checkbox" id="user_${user.uid}" value="${user.uid}" checked data-name="${user.displayName}">
                <span class="mr-2 text-sm">${user.displayName}</span>
            </label>`;
    });

    // مراقبة زر المرسال
    const messengerToggle = document.getElementById('isMessenger');
    if(messengerToggle) {
        messengerToggle.onchange = function() {
            const myCheck = document.getElementById(`user_${currentUserID}`);
            if(myCheck) myCheck.checked = !this.checked;
        };
    }
}

window.selectAllParticipants = function() {
    document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]:not([disabled])').forEach(cb => cb.checked = true);
};

window.previewExpense = function() {
    const title = document.getElementById('expenseTitle').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value.replace(/,/g, ''));
    const isMessenger = document.getElementById('isMessenger')?.checked || false;
    
    // المشاركون المختارون
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input:checked');
    const participants = Array.from(checkboxes).map(cb => cb.value);

    if (!title || isNaN(amount) || amount <= 0 || participants.length === 0) {
        alert('الرجاء إدخال البيانات بشكل صحيح وتحديد مشارك واحد على الأقل.');
        return;
    }

    const share = roundToTwo(amount / participants.length);

    // تجهيز العرض
    const names = participants.map(uid => getUserNameById(uid)).join('، ');
    let html = `
        <p><strong>المصروف:</strong> ${title}</p>
        <p><strong>المبلغ:</strong> ${amount.toLocaleString()} SDG</p>
        <p><strong>الوضع:</strong> ${isMessenger ? 'مرسال (لن تدفع حصة)' : 'مشارك ودافع'}</p>
        <p><strong>نصيب الفرد:</strong> <span class="text-red-600 font-bold">${share.toLocaleString()} SDG</span></p>
        <p class="text-sm text-gray-500 mt-2"><strong>المشاركون (${participants.length}):</strong> ${names}</p>
    `;
    
    document.getElementById('previewText').innerHTML = html;
    
    // إخفاء/إظهار تحذير المرسال
    const msgWarn = document.getElementById('messengerConfirmation');
    const normPreview = document.getElementById('previewDetails');
    if(isMessenger && msgWarn) {
        msgWarn.style.display = 'block';
        if(normPreview) normPreview.style.display = 'none';
    } else {
        if(msgWarn) msgWarn.style.display = 'none';
        if(normPreview) normPreview.style.display = 'block';
    }

    pendingExpense = { title, amount, participants, share, isMessenger };
    document.getElementById('previewModal').classList.add('show');
};

window.saveExpense = async function() {
    window.hideModal();
    if (!pendingExpense) return;
    const { title, amount, participants, share, isMessenger } = pendingExpense;

    const updates = {};
    const newKey = push(ref(db, 'expenses')).key;
    const payerName = currentUserDB ? currentUserDB.displayName : 'مستخدم';

    // 1. حفظ المصروف
    updates[`expenses/${newKey}`] = {
        title, amount, share,
        payer_id: currentUserID,
        participants_ids: participants,
        is_messenger: isMessenger,
        timestamp: Date.now(),
        date: new Date().toISOString().split('T')[0]
    };

    // 2. تحديث الأرصدة والإشعارات
    // ملاحظة: نقوم بتحديث الأرصدة بناءً على "من يدين لمن".
    // قاعدة البيانات: balance هو الرصيد التراكمي.
    
    // نحدث أرصدة المشاركين (عليهم دين)
    participants.forEach(uid => {
        // إذا كنت أنا الدافع ولست مشاركاً (مرسال)، لا يتغير رصيدي هنا، بل يتغير عند التسوية.
        // لكن لتبسيط النموذج:
        // كل مشارك (غير الدافع) ينقص رصيده بمقدار حصته (دين عليه).
        // الدافع يزيد رصيده بمقدار (المبلغ الكلي - حصته).
        
        // سنجلب الرصيد الحالي من allUsers (الذاكرة المحلية) للتسريع، لكن التحديث سيكون ذرياً في DB
        const userObj = allUsers.find(u => u.uid === uid);
        let currentBal = userObj ? userObj.balance : 0;

        if (uid === currentUserID) {
            // أنا الدافع
            // إذا كنت مشاركاً: أدفعت (amount) واستهلكت (share) -> الرصيد + (amount - share)
            // إذا كنت مرسالاً: دفعت (amount) واستهلكت (0) -> الرصيد + (amount)
            const myGain = isMessenger ? amount : (amount - share);
            currentBal += myGain;
        } else {
            // مشارك آخر: عليه دفع حصته
            currentBal -= share;
            
            // إشعار
            const notifKey = push(ref(db, 'notifications')).key;
            updates[`notifications/${notifKey}`] = {
                recipientId: uid,
                message: `${payerName} اشترى "${title}". حصتك: ${share.toLocaleString()} SDG`,
                timestamp: Date.now(), read: false
            };
        }
        updates[`users/${uid}/balance`] = roundToTwo(currentBal);
    });

    try {
        await update(ref(db), updates);
        document.getElementById('successModal').classList.add('show');
        document.getElementById('expenseForm').reset();
        window.populateParticipants();
        pendingExpense = null;
    } catch (e) {
        console.error(e);
        alert('فشل الحفظ. تأكد من الاتصال بالإنترنت.');
    }
};

window.handleSaveClick = () => window.saveExpense(); // alias

// ============================================================
// 📜 منطق صفحة السجلات (History & Settlement)
// ============================================================

window.setFilter = function(filter, element) {
    activeFilter = filter;
    document.querySelectorAll('.filter-pill').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');

    const expCont = document.getElementById('expensesContainer');
    const sumCont = document.getElementById('summaryContainer');

    if (filter === 'summary') {
        if(expCont) expCont.classList.add('hidden');
        if(sumCont) sumCont.classList.remove('hidden');
        if(document.getElementById('loadMoreHistory')) document.getElementById('loadMoreHistory').classList.add('hidden');
        displaySummary();
    } else {
        if(sumCont) sumCont.classList.add('hidden');
        if(expCont) expCont.classList.remove('hidden');
        currentHistoryIndex = 0;
        displayHistory();
    }
}

function getFilterStartDate(filter) {
    const now = new Date();
    if(filter === '30days') return now.setDate(now.getDate() - 30);
    if(filter === '3months') return now.setMonth(now.getMonth() - 3);
    return 0;
}

window.displayHistory = function(isLoadMore = false) {
    const container = document.getElementById('expensesContainer');
    const loadMoreBtn = document.getElementById('loadMoreHistory');
    if (!container) return;

    if (!isLoadMore) container.innerHTML = '<p class="text-center text-gray-400 mt-10">جاري التحميل...</p>';

    // دمج وفرز
    const combined = [
        ...allExpenses.map(e => ({...e, type: 'expense'})),
        ...allSettlements.map(s => ({...s, type: 'settlement'}))
    ].sort((a,b) => b.timestamp - a.timestamp);

    // فلترة
    const startDate = getFilterStartDate(activeFilter);
    const filtered = combined.filter(item => {
        if (item.timestamp < startDate) return false;
        if (activeFilter === 'incoming') return (item.type==='expense' && item.payer_id===currentUserID) || (item.type==='settlement' && item.recipient_id===currentUserID);
        if (activeFilter === 'outgoing') return (item.type==='expense' && item.payer_id!==currentUserID && item.participants_ids.includes(currentUserID)) || (item.type==='settlement' && item.payer_id===currentUserID);
        return true;
    });

    // Pagination
    const toShow = filtered.slice(currentHistoryIndex, currentHistoryIndex + historyDisplayLimit);
    if (!isLoadMore) container.innerHTML = '';
    
    if (filtered.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-4">لا توجد سجلات.</p>';
        if(loadMoreBtn) loadMoreBtn.classList.add('hidden');
        return;
    }

    toShow.forEach(item => {
        const { date, time } = formatBankDate(item.timestamp);
        let html = '';

        if (item.type === 'settlement') {
            const isPayer = item.payer_id === currentUserID;
            const otherName = isPayer ? getUserNameById(item.recipient_id) : getUserNameById(item.payer_id);
            const title = isPayer ? `تسوية مدفوعة لـ ${otherName}` : `تسوية مستلمة من ${otherName}`;
            const amount = item.amount.toLocaleString();
            
            html = `
            <div class="bankak-card bg-yellow-50 border-yellow-200">
                <div class="card-main-content">
                    <div class="amount-display ${isPayer ? 'amount-neg' : 'amount-pos'}">
                        ${isPayer ? '-' : '+'} ${amount} <span class="text-sm font-normal">SDG</span>
                    </div>
                    <div class="details-wrapper">
                        <div class="bank-icon-container ml-3 text-yellow-600 border-yellow-400">
                            <i class="fas fa-handshake"></i>
                        </div>
                        <div class="details-text text-right">
                            <p class="transaction-title">تسوية (عملية: ${item.reference})</p>
                            <p class="transaction-sub">${title}</p>
                        </div>
                    </div>
                </div>
                <div class="card-footer-date"><span>${date}</span><span>${time}</span></div>
            </div>`;
        } else {
            // Expense
            const isPayer = item.payer_id === currentUserID;
            const myShare = item.participants_ids.includes(currentUserID) && !item.is_messenger ? item.share : 0;
            // إذا لم يكن لي علاقة بالمصروف (لست دافع ولست مشارك)، لا اعرضه
            if (!isPayer && myShare === 0) return;

            const net = isPayer ? (item.total_amount - (item.is_messenger ? 0 : item.share)) : myShare;
            const title = isPayer 
                ? `دفعت ${item.total_amount.toLocaleString()} للجميع` 
                : `دين عليك لـ ${getUserNameById(item.payer_id)}`;
            
            html = `
            <div class="bankak-card">
                <div class="card-main-content">
                    <div class="amount-display ${isPayer ? 'amount-pos' : 'amount-neg'}">
                        ${isPayer ? '+' : '-'} ${net.toLocaleString()} <span class="text-sm font-normal">SDG</span>
                    </div>
                    <div class="details-wrapper">
                        <div class="bank-icon-container ml-3 ${isPayer ? 'icon-success' : 'icon-danger'}">
                            <i class="fas ${isPayer ? 'fa-arrow-up' : 'fa-arrow-down'}"></i>
                        </div>
                        <div class="details-text text-right">
                            <p class="transaction-title">${item.title}</p>
                            <p class="transaction-sub">${title}</p>
                        </div>
                    </div>
                </div>
                <div class="card-footer-date"><span>${date}</span><span>${time}</span></div>
            </div>`;
        }
        container.innerHTML += html;
    });

    currentHistoryIndex += toShow.length;
    if(loadMoreBtn) {
        if(currentHistoryIndex < filtered.length) {
            loadMoreBtn.classList.remove('hidden');
            loadMoreBtn.textContent = 'عرض المزيد';
            loadMoreBtn.onclick = () => window.displayHistory(true);
        } else {
            loadMoreBtn.classList.add('hidden');
        }
    }
}

// 💰 حساب الأرصدة الصافية (Net Balances Calculation)
function calculateNetBalances() {
    if (!currentUserID) return;
    netBalances = {};
    
    // 1. تأثير المصروفات
    allExpenses.forEach(e => {
        const isPayer = e.payer_id === currentUserID;
        
        if (isPayer) {
            // أنا دفعت: الجميع مدينون لي بحصصهم
            e.participants_ids.forEach(uid => {
                if (uid !== currentUserID) {
                    netBalances[uid] = (netBalances[uid] || 0) + e.share;
                }
            });
        } else if (e.participants_ids.includes(currentUserID)) {
            // أنا مشارك: أنا مدين للدافع بحصتي
            // (إلا إذا كنت مرسالاً في مصروف شخص آخر، وهذا نادر في هذا المنطق)
            const payerId = e.payer_id;
            netBalances[payerId] = (netBalances[payerId] || 0) - e.share;
        }
    });

    // 2. تأثير التسويات (تصحيح الرصيد)
    allSettlements.forEach(s => {
        const { payer_id, receiver_id, amount } = s;
        // إذا دفعت لشخص (payer_id = أنا): ديني ينقص (يضاف لرصيدي السالب ليقترب من الصفر)
        if (payer_id === currentUserID) {
            netBalances[receiver_id] = (netBalances[receiver_id] || 0) + amount;
        }
        // إذا استلمت من شخص (receiver_id = أنا): دينه لي ينقص (يطرح من رصيدي الموجب)
        else if (receiver_id === currentUserID) {
            netBalances[payer_id] = (netBalances[payer_id] || 0) - amount;
        }
    });
}

function displaySummary() {
    const container = document.getElementById('summaryContainer');
    if(!container) return;
    
    calculateNetBalances(); // تأكد من الحساب قبل العرض
    
    let html = '<h3 class="font-bold text-gray-700 mb-4 border-b pb-2">ملخص الأرصدة الصافية</h3>';
    let hasData = false;

    for (const uid in netBalances) {
        const bal = roundToTwo(netBalances[uid]);
        if (Math.abs(bal) < 1) continue; // تجاهل الكسور الصغيرة جداً
        hasData = true;
        
        const isPos = bal > 0; // موجب = هو مدين لي (داير منه)
        const absBal = Math.abs(bal).toLocaleString();
        const name = getUserNameById(uid);
        
        html += `
        <div class="p-4 border-r-4 ${isPos ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'} rounded-lg mb-3 shadow-sm flex justify-between items-center">
            <div>
                <p class="font-bold text-gray-700">${isPos ? `${name} داير منك` : `أنت داير لـ ${name}`}</p>
                <span class="text-xl font-extrabold dir-ltr">${absBal} SDG</span>
            </div>
            <button onclick="openSettleModal('${uid}', '${name}', '${isPos ? 'receive' : 'pay'}', ${Math.abs(bal)})" 
                    class="btn text-xs px-4 py-2 w-auto ${isPos ? 'bg-green-600' : 'bg-red-600'} text-white rounded-lg">
                تسوية
            </button>
        </div>`;
    }
    
    if (!hasData) html += '<p class="text-center text-gray-500 mt-4">لا توجد ديون أو مستحقات حالياً.</p>';
    container.innerHTML = html;
}

window.openSettleModal = function(uid, name, type, amount) {
    settleTargetUID = uid; settleTargetName = name; settleActionType = type; settleMaxAmount = amount;
    
    const summary = document.getElementById('settleSummary');
    summary.innerHTML = `
        <p>العملية: <strong>${type === 'pay' ? 'دفع لـ' : 'استلام من'} ${name}</strong></p>
        <p>المبلغ المستحق: <span class="font-bold dir-ltr">${amount.toLocaleString()} SDG</span></p>
    `;
    
    document.getElementById('settleAmountInput').value = amount;
    document.getElementById('settleReference').value = '';
    
    const btn = document.getElementById('confirmSettleButton');
    btn.textContent = 'تأكيد التسوية';
    btn.disabled = false;
    
    document.getElementById('settleModal').classList.add('show');
}

window.confirmSettleUp = async function() {
    const amount = parseFloat(document.getElementById('settleAmountInput').value.replace(/,/g, ''));
    const refNum = document.getElementById('settleReference').value.trim();
    
    if (!amount || amount <= 0 || !refNum || refNum.length < 4) {
        alert('البيانات غير صحيحة. تأكد من المبلغ ورقم المرجع.');
        return;
    }
    
    document.getElementById('confirmSettleButton').disabled = true;
    window.hideSettleModal();

    const updates = {};
    // التحديث المباشر للأرصدة (نفس منطق الحساب):
    // دفع (Pay): رصيدي يزيد (لأن الدين ينقص)، رصيده ينقص
    const myChange = settleActionType === 'pay' ? -amount : amount; // في الحقيقة: الدين سالب، الدفع يعيدني للصفر، إذن +amount
    // لحظة: في قاعدة البيانات "balance" هو الرصيد المطلق.
    // إذا كنت مديناً بـ -1000، ودفعت 1000، رصيدي يصبح 0. (+1000)
    // دعنا نعتمد على المنطق البسيط: التسوية هي نقل مال.
    
    const payer = settleActionType === 'pay' ? currentUserID : settleTargetUID;
    const receiver = settleActionType === 'pay' ? settleTargetUID : currentUserID;
    
    // جلب الأرصدة الحالية
    const payerObj = allUsers.find(u => u.uid === payer);
    const receiverObj = allUsers.find(u => u.uid === receiver);
    
    // الدافع يخرج منه مال -> رصيده المحاسبي يقل؟ لا، في نظامنا الرصيد هو "ما لي/ما علي".
    // إذا دفعت ديناً، فإن "ما علي" يقل (يصبح أكثر إيجابية).
    // إذن: الدافع (الذي يسدد الدين) يضاف له المبلغ. المستلم (الذي سدد دينه) يطرح منه المبلغ.
    
    updates[`users/${payer}/balance`] = roundToTwo(payerObj.balance + amount);
    updates[`users/${receiver}/balance`] = roundToTwo(receiverObj.balance - amount);

    // تسجيل العملية
    const key = push(ref(db, 'settlements')).key;
    updates[`settlements/${key}`] = {
        amount, payer_id: payer, recipient_id: receiver, // لاحظ توحيد التسميات (recipient_id)
        reference: refNum, timestamp: Date.now()
    };

    try {
        await update(ref(db), updates);
        document.getElementById('successModal').classList.add('show');
    } catch(e) {
        alert('فشل التسوية: ' + e.message);
    }
};

// ============================================================
// 📋 صفحة مصروفاتي (my_expenses.html)
// ============================================================
function displayMyExpensesSummary() {
    const totalEl = document.getElementById('totalMyExpenses');
    const listEl = document.getElementById('myExpenseHistory');
    if (!totalEl) return;

    let total = 0;
    let html = '';
    const myExps = allExpenses.filter(e => e.participants_ids.includes(currentUserID)).sort((a, b) => b.timestamp - a.timestamp);

    myExps.forEach(e => {
        const myShare = e.share;
        total += myShare;
        const { date, time } = formatBankDate(e.timestamp);
        
        html += `
        <div class="expense-item-card">
            <div class="text-right">
                <p class="font-bold text-gray-800">${e.title}</p>
                <span class="text-xs text-gray-500">${date}</span>
            </div>
            <div class="text-left text-red-600 font-bold dir-ltr">
                - ${myShare.toLocaleString()} SDG
            </div>
        </div>`;
    });
    
    totalEl.textContent = total.toLocaleString();
    listEl.innerHTML = html || '<p class="text-center text-gray-400">لا توجد بيانات.</p>';
}

// ============================================================
// 🔔 الإشعارات
// ============================================================
window.openNotificationModal = function() {
    const list = document.getElementById('notificationsList');
    if(!list) return;
    
    const myNotifs = allNotifications.filter(n => n.recipientId === currentUserID).sort((a,b) => b.timestamp - a.timestamp);
    let html = '';
    if(myNotifs.length === 0) html = '<p class="text-gray-500 text-center">لا توجد إشعارات.</p>';
    
    myNotifs.forEach(n => {
        const { date } = formatBankDate(n.timestamp);
        html += `
        <div class="p-3 mb-2 rounded border ${n.read ? 'bg-white' : 'bg-blue-50 border-blue-200'}">
            <p class="text-sm">${n.message}</p>
            <span class="text-xs text-gray-400">${date}</span>
        </div>`;
    });
    
    list.innerHTML = html;
    document.getElementById('notificationModal').classList.add('show');
}

window.markAllAsRead = async function() {
    const updates = {};
    allNotifications.filter(n => n.recipientId === currentUserID && !n.read).forEach(n => {
        updates[`notifications/${n.firebaseId}/read`] = true;
    });
    if(Object.keys(updates).length > 0) await update(ref(db), updates);
}

// ============================================================
// 🔄 تحميل البيانات (Core)
// ============================================================
function loadData() {
    if (!currentUserID) return;

    // Users
    onValue(ref(db, 'users'), snap => {
        if(snap.exists()) {
            const val = snap.val();
            allUsers = Object.keys(val).map(k => ({uid: k, ...val[k]}));
            currentUserDB = allUsers.find(u => u.uid === currentUserID);
            
            updateCommonUI();
            if(document.getElementById('expenseForm')) populateParticipants();
        }
    });

    // Expenses
    onValue(ref(db, 'expenses'), snap => {
        if(snap.exists()) {
            const val = snap.val();
            allExpenses = Object.keys(val).map(k => ({firebaseId: k, ...val[k]}));
            
            // تحديث الصفحات ذات الصلة
            if(document.getElementById('expensesContainer')) { currentHistoryIndex=0; displayHistory(); }
            if(document.getElementById('myExpenseHistory')) displayMyExpensesSummary();
            if(document.getElementById('summaryContainer') && !document.getElementById('summaryContainer').classList.contains('hidden')) displaySummary();
        }
    });

    // Settlements
    onValue(ref(db, 'settlements'), snap => {
        if(snap.exists()) {
            const val = snap.val();
            allSettlements = Object.keys(val).map(k => ({firebaseId: k, ...val[k]}));
            
            // تحديث السجل والملخص
            if(document.getElementById('expensesContainer')) displayHistory();
            if(document.getElementById('summaryContainer') && !document.getElementById('summaryContainer').classList.contains('hidden')) displaySummary();
        }
    });

    // Notifications
    onValue(ref(db, 'notifications'), snap => {
        if(snap.exists()) {
            const val = snap.val();
            allNotifications = Object.keys(val).map(k => ({firebaseId: k, ...val[k]}));
            updateCommonUI();
        }
    });
}

// 🔐 Auth Listener
onAuthStateChanged(auth, user => {
    const isAuthPage = window.location.href.includes('auth.html');
    if (user) {
        currentUserID = user.uid;
        if(isAuthPage) window.location.href = 'index.html';
        else loadData();
    } else {
        if(!isAuthPage) window.location.href = 'auth.html';
    }
});