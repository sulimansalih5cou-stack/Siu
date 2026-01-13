// 🔥 تهيئة واستيراد Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update, runTransaction } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// 🛑 إعدادات Firebase
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

// متغيرات عامة
let allUsers = [];
let currentUserID = null;
let currentUserDB = null;
let allExpenses = [];
let allSettlements = [];
let userNotifications = [];
let netBalances = {};

// ============================================================
// 🛠️ دوال مساعدة
// ============================================================

function getUserNameById(uid) {
    const user = allUsers.find(u => u.uid === uid);
    return user ? user.displayName : 'مستخدم غير معروف';
}

function roundToTwo(num) {
    return Math.round(num * 100) / 100;
}

function formatBankDate(timestamp) {
    if (!timestamp) return { date: '--', time: '--' };
    const dateObj = new Date(timestamp);
    const day = dateObj.getDate();
    const month = dateObj.toLocaleString('ar-EG', { month: 'short' });
    const year = dateObj.getFullYear();
    const date = `${day}-${month}-${year}`;
    const time = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return { date, time };
}

// ============================================================
// 💰 منطق التسوية المطور (إضافة التسوية كمصروف شخصي تلقائياً)
// ============================================================

window.sendSettleTransaction = async function(recipientUID, amountInput, opNumber) {
    const amount = parseFloat(amountInput); 

    if (!currentUserID || !recipientUID || isNaN(amount) || amount <= 0 || !db) {
        alert("خطأ في بيانات التسوية.");
        return false;
    }

    const payerName = getUserNameById(currentUserID);
    const recipientName = getUserNameById(recipientUID);
    const updates = {};
    const newSettleRef = push(ref(db, 'settlements'));
    const newExpenseRef = push(ref(db, 'expenses')); // مرجع لإنشاء مصروف شخصي

    try {
        // 1. تحديث رصيد الدافع (أنت) - زيادة الرصيد تعني دفع دين
        await runTransaction(ref(db, `users/${currentUserID}/balance`), (currentBalance) => {
            return roundToTwo((currentBalance || 0) + amount);
        });

        // 2. تحديث رصيد المستلم
        await runTransaction(ref(db, `users/${recipientUID}/balance`), (currentBalance) => {
            return roundToTwo((currentBalance || 0) - amount);
        });

        // 3. سجل التسوية الرسمي (لتصفية المديونية بينكما)
        updates[`settlements/${newSettleRef.key}`] = {
            payer_id: currentUserID,
            recipient_id: recipientUID,
            amount: amount,
            operation_number: opNumber,
            timestamp: Date.now()
        };

        // 4. 🔥 المهم: تسجيل العملية كمصروف شخصي لك لكي تظهر في "مصروفاتي"
        updates[`expenses/${newExpenseRef.key}`] = {
            title: `تسوية دين لـ ${recipientName}`,
            total_amount: amount,
            share: amount,
            payer_id: currentUserID,
            participants_ids: [currentUserID], // أنت المشارك الوحيد لتظهر في مصروفاتك الشخصية
            is_messenger: false,
            timestamp: Date.now(),
            note: `رقم العملية: ${opNumber}`
        };

        // 5. إرسال إشعار للمستلم
        const newNotifKey = push(ref(db, 'notifications')).key;
        updates[`notifications/${newNotifKey}`] = {
            uid: recipientUID,
            message: `${payerName} قام بتسوية دين بمبلغ ${amount.toLocaleString()} SDG لك.`,
            timestamp: Date.now(),
            is_read: false,
            type: 'settlement_received'
        };

        await update(ref(db), updates);
        return true;
    } catch (e) {
        console.error("Settlement Error:", e);
        alert('فشلت العملية.');
        return false;
    }
};

// ============================================================
// 📊 حساب الأرصدة والملخص
// ============================================================

function calculateNetBalances() {
    if (!currentUserID || allUsers.length === 0) return;
    netBalances = {};
    allUsers.forEach(u => { if (u.uid !== currentUserID) netBalances[u.uid] = 0; });

    allExpenses.forEach(exp => {
        const share = Number(exp.share) || 0;
        if (exp.payer_id === currentUserID) {
            exp.participants_ids.forEach(uid => { if (uid !== currentUserID) netBalances[uid] += share; });
        } else if (exp.participants_ids.includes(currentUserID)) {
            netBalances[exp.payer_id] -= share;
        }
    });

    allSettlements.forEach(settle => {
        const amt = Number(settle.amount) || 0;
        if (settle.payer_id === currentUserID) netBalances[settle.recipient_id] += amt;
        else if (settle.recipient_id === currentUserID) netBalances[settle.payer_id] -= amt;
    });
}

function updateSummaryDisplay() {
    const debtContainer = document.getElementById('debtContainer');
    const claimList = document.getElementById('claimList');
    if (!debtContainer || !claimList) return;

    debtContainer.innerHTML = '';
    claimList.innerHTML = '';
    let tDebt = 0, tCredit = 0;

    Object.keys(netBalances).forEach(uid => {
        const bal = netBalances[uid];
        const name = getUserNameById(uid);
        if (bal < -0.1) {
            const amt = Math.abs(bal);
            tDebt += amt;
            debtContainer.innerHTML += `
                <div class="balance-card">
                    <div class="balance-info">
                        <span class="balance-name">${name}</span>
                        <span class="balance-status text-red-600">يطلبك: ${amt.toLocaleString()} SDG</span>
                    </div>
                    <button class="action-button" onclick="showSettleModal('${name}', ${amt}, '${uid}')">تسوية</button>
                </div>`;
        } else if (bal > 0.1) {
            tCredit += bal;
            claimList.innerHTML += `
                <div class="claim-item">
                    <span>${name}: <span class="text-green-600 font-bold">${bal.toLocaleString()} SDG</span></span>
                </div>`;
        }
    });

    document.getElementById('totalDebt').innerHTML = `${tDebt.toLocaleString()} <span class="text-sm font-normal">SDG</span>`;
    document.getElementById('totalCredit').innerHTML = `${tCredit.toLocaleString()} <span class="text-sm font-normal">SDG</span>`;
    
    const noDebts = document.getElementById('noDebts');
    if (noDebts) noDebts.classList.toggle('hidden', tDebt > 0.1);
}

// ============================================================
// 📱 التحكم بالواجهة (Modals)
// ============================================================

let currentSettleMaxAmount = 0;
let currentSettleRecipientUID = '';

window.showSettleModal = function(name, amount, uid) {
    currentSettleMaxAmount = amount;
    currentSettleRecipientUID = uid;
    document.getElementById('settleRelation').textContent = `تسوية لـ ${name}`;
    document.getElementById('maxSettleAmountDisplay').textContent = amount.toLocaleString();
    document.getElementById('settleAmount').value = amount;
    document.getElementById('settleModal').classList.add('show');
};

window.hideSettleModal = () => {
    document.getElementById('settleModal').classList.remove('show');
    document.getElementById('settleForm').reset();
};

// ============================================================
// 🔄 استماع البيانات (Real-time Listeners)
// ============================================================

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        loadData();
    } else {
        window.location.href = 'auth.html';
    }
});

function loadData() {
    onValue(ref(db, 'users'), (snap) => {
        allUsers = snap.exists() ? Object.keys(snap.val()).map(k => ({uid: k, ...snap.val()[k]})) : [];
        currentUserDB = allUsers.find(u => u.uid === currentUserID);
        if (currentUserDB) document.getElementById('currentBalance').textContent = (currentUserDB.balance || 0).toLocaleString();
    });

    onValue(ref(db, 'expenses'), (snap) => {
        allExpenses = snap.exists() ? Object.values(snap.val()) : [];
        calculateNetBalances();
        updateSummaryDisplay();
    });

    onValue(ref(db, 'settlements'), (snap) => {
        allSettlements = snap.exists() ? Object.values(snap.val()) : [];
        calculateNetBalances();
        updateSummaryDisplay();
    });
}

// تنفيذ التسوية عند الضغط على الزر في الفورم
document.addEventListener('DOMContentLoaded', () => {
    const settleForm = document.getElementById('settleForm');
    if (settleForm) {
        settleForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const opNum = document.getElementById('operationNumber').value;
            const amount = parseFloat(document.getElementById('settleAmount').value.replace(/,/g, ''));

            if (opNum.length < 3 || isNaN(amount) || amount <= 0) return alert("بيانات غير صحيحة");

            const success = await window.sendSettleTransaction(currentSettleRecipientUID, amount, opNum);
            if (success) {
                alert("تمت التسوية بنجاح وتم تسجيلها في مصروفاتك الشخصية.");
                window.hideSettleModal();
            }
        });
    }
});
