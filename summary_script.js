import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyA2GNsXj4DzWyCYLKuVT3i1XBKfjX3ccuM",
    authDomain: "siu-students.firebaseapp.com",
    databaseURL: "https://siu-students-default-rtdb.firebaseio.com",
    projectId: "siu-students",
    storageBucket: "siu-students.firebasestorage.app",
    messagingSenderId: "76007314543",
    appId: "1:76007314543:web:4850b668cec4b93bdc699a"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let currentUserID = null;
let allUsers = [];
let allExpenses = [];
let allSettlements = [];
let userNotifications = [];
let netBalances = {};
let currentSettleRecipientUID = '';
let currentSettleMaxAmount = 0;

// --- مراقبة حالة تسجيل الدخول ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        loadData();
    } else {
        window.location.href = 'auth.html';
    }
});

// --- تحميل البيانات من قاعدة البيانات ---
function loadData() {
    onValue(ref(db), (snapshot) => {
        const data = snapshot.val() || {};
        allUsers = data.users ? Object.keys(data.users).map(k => ({uid: k, ...data.users[k]})) : [];
        allExpenses = data.expenses ? Object.values(data.expenses) : [];
        allSettlements = data.settlements ? Object.values(data.settlements) : [];
        userNotifications = data.notifications ? Object.keys(data.notifications)
            .map(k => ({id: k, ...data.notifications[k]}))
            .filter(n => n.uid === currentUserID)
            .sort((a,b) => b.timestamp - a.timestamp) : [];

        const me = allUsers.find(u => u.uid === currentUserID);
        if (me) {
            document.getElementById('sidebarUserName').textContent = me.displayName;
            document.getElementById('sidebarUserEmail').textContent = auth.currentUser.email;
        }

        calculateBalances();
        updateNotificationBadge();
    });
}

// --- حساب الأرصدة والديون ---
function calculateBalances() {
    netBalances = {};
    allUsers.forEach(u => { if(u.uid !== currentUserID) netBalances[u.uid] = 0; });

    allExpenses.forEach(exp => {
        const share = Number(exp.share) || 0;
        if (exp.payer_id === currentUserID) {
            exp.participants_ids.forEach(pid => { if(pid !== currentUserID) netBalances[pid] += share; });
        } else if (exp.participants_ids.includes(currentUserID)) {
            netBalances[exp.payer_id] -= share;
        }
    });

    allSettlements.forEach(set => {
        const amt = Number(set.amount) || 0;
        if (set.payer_id === currentUserID) netBalances[set.recipient_id] += amt;
        else if (set.recipient_id === currentUserID) netBalances[set.payer_id] -= amt;
    });
    renderUI();
}

// --- تحديث واجهة المستخدم ---
function renderUI() {
    const debtContainer = document.getElementById('debtContainer');
    const claimList = document.getElementById('claimList');
    let tDebt = 0, tCredit = 0;

    debtContainer.innerHTML = ''; claimList.innerHTML = '';

    Object.keys(netBalances).forEach(uid => {
        const bal = netBalances[uid];
        const userObj = allUsers.find(u => u.uid === uid);
        const name = userObj ? userObj.displayName : "مستخدم";

        if (bal < -0.5) {
            const amt = Math.abs(bal); 
            tDebt += amt;
            debtContainer.innerHTML += `
                <div class="balance-card">
                    <div>
                        <p class="font-bold text-sm text-gray-800">${name}</p>
                        <p class="text-[10px] text-red-500">${amt.toLocaleString('en-US')} SDG</p>
                    </div>
                    <button onclick="showSettleModal('${name}', ${amt}, '${uid}')" class="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold">تسوية</button>
                </div>`;
        } else if (bal > 0.5) {
            tCredit += bal;
            claimList.innerHTML += `
                <div class="flex justify-between items-center p-3 bg-gray-50 rounded-xl mb-2">
                    <div>
                        <p class="font-bold text-xs">${name}</p>
                        <p class="text-green-600 font-bold text-xs">${bal.toLocaleString('en-US')} SDG</p>
                    </div>
                    <button onclick="nudgeUser('${name}', '${uid}', ${bal})" class="nudge-btn">نكز</button>
                </div>`;
        }
    });
    document.getElementById('totalDebt').textContent = tDebt.toLocaleString('en-US');
    document.getElementById('totalCredit').textContent = tCredit.toLocaleString('en-US');
    document.getElementById('noDebts').classList.toggle('hidden', tDebt > 0);
}

// --- ميزة النكز ---
window.nudgeUser = async (name, uid, amount) => {
    try {
        const myName = document.getElementById('sidebarUserName').textContent;
        const notifKey = push(ref(db, 'notifications')).key;
        await update(ref(db, `notifications/${notifKey}`), {
            uid: uid,
            message: `🔔 نكز: يذكرك ${myName} بسداد مبلغ ${amount.toLocaleString('en-US')} SDG.`,
            timestamp: Date.now(), 
            is_read: false
        });
        alert(`تم نكز ${name} بنجاح!`);
    } catch(e) { alert("فشل النكز"); }
};

// --- عرض الإشعارات ---
window.showNotifications = async () => {
    document.getElementById('notificationModal').classList.add('show');
    const list = document.getElementById('notificationsList');

    if (userNotifications.length === 0) {
        list.innerHTML = '<p class="text-center py-10 opacity-50 text-xs">لا توجد إشعارات</p>';
    } else {
        list.innerHTML = userNotifications.map(n => `
            <div class="p-3 rounded-xl border ${n.is_read ? 'bg-gray-50' : 'bg-blue-50 border-blue-200'} mb-2">
                <p class="text-xs font-bold text-gray-800">${n.message}</p>
                <p class="text-[9px] text-gray-400 mt-1">${new Date(n.timestamp).toLocaleString('ar-EG')}</p>
            </div>`).join('');
    }

    const unread = userNotifications.filter(n => !n.is_read);
    if (unread.length > 0) {
        const updates = {};
        unread.forEach(n => updates[`notifications/${n.id}/is_read`] = true);
        await update(ref(db), updates);
    }
};

// --- منطق التسوية المطور ---

// 1. فتح المودال وتجهيز البيانات
window.showSettleModal = (name, amt, uid) => {
    currentSettleRecipientUID = uid; 
    currentSettleMaxAmount = amt;

    document.getElementById('settleRelation').textContent = `تسوية لـ ${name}`;
    document.getElementById('maxSettleAmountDisplay').textContent = amt.toLocaleString('en-US');

    // نضع القيمة رقمية صافية في البداية
    document.getElementById('settleAmount').value = amt;
    updateRemainingBalance(amt);

    document.getElementById('settleModal').classList.add('show');
};

// 2. دالة حساب الباقي اللحظية
function updateRemainingBalance(val) {
    const cleanVal = Number(String(val).replace(/,/g, '')) || 0;
    const remaining = currentSettleMaxAmount - cleanVal;

    const remDiv = document.getElementById('remainingBalance');
    const remValueSpan = document.getElementById('remainingValue');

    remDiv.classList.remove('hidden');
    remValueSpan.textContent = remaining.toLocaleString('en-US');

    // تغيير اللون إذا تجاوز المبلغ المطلوب
    remValueSpan.style.color = remaining < 0 ? "#ef4444" : "#6b7280";
}

// 3. مراقب الإدخال لمنع تداخل اللغات وتحديث الحساب
document.getElementById('settleAmount').addEventListener('input', function(e) {
    // السماح بالأرقام فقط
    let rawValue = e.target.value.replace(/[^0-9]/g, ''); 

    if (rawValue !== "") {
        updateRemainingBalance(rawValue);
        // التنسيق أثناء الكتابة (اختياري، استخدمنا en-US لضمان عدم ظهور أرقام هندية)
        e.target.value = Number(rawValue).toLocaleString('en-US');
    } else {
        updateRemainingBalance(0);
    }
});

// 4. إرسال التسوية والإشعار للطرف الآخر
document.getElementById('settleForm').onsubmit = async (e) => {
    e.preventDefault();
    const amount = Number(document.getElementById('settleAmount').value.replace(/,/g, ''));
    const opNum = document.getElementById('operationNumber').value;
    const myName = document.getElementById('sidebarUserName').textContent;

    if (isNaN(amount) || amount <= 0) return alert("المبلغ غير صحيح");
    if (amount > currentSettleMaxAmount + 5) return alert("المبلغ يتجاوز الدين المطلوب");

    try {
        const updates = {};
        const sKey = push(ref(db, 'settlements')).key;
        const nKey = push(ref(db, 'notifications')).key;

        // إضافة التسوية
        updates[`settlements/${sKey}`] = { 
            payer_id: currentUserID, 
            recipient_id: currentSettleRecipientUID, 
            amount: amount, 
            operation_number: opNum, 
            timestamp: Date.now() 
        };

        // إرسال إشعار للطرف الآخر
        updates[`notifications/${nKey}`] = { 
            uid: currentSettleRecipientUID, 
            message: `✅ تسوية مستلمة: ${amount.toLocaleString('en-US')} SDG من ${myName}`, 
            timestamp: Date.now(), 
            is_read: false 
        };

        await update(ref(db), updates);
        alert("تمت التسوية بنجاح!");
        hideSettleModal();
        e.target.reset();
    } catch(e) { 
        alert("فشلت العملية، يرجى المحاولة لاحقاً"); 
    }
};

// --- وظائف مساعدة للإغلاق والفتح ---
window.toggleSidebar = () => document.getElementById('sidebar').classList.toggle('open');
window.hideSettleModal = () => document.getElementById('settleModal').classList.remove('show');
window.hideNotificationModal = () => document.getElementById('notificationModal').classList.remove('show');
window.showClaimModal = () => document.getElementById('claimModal').classList.add('show');
window.hideClaimModal = () => document.getElementById('claimModal').classList.remove('show');

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    const count = userNotifications.filter(n => !n.is_read).length;
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
}

document.getElementById('logoutBtn').onclick = () => signOut(auth);

