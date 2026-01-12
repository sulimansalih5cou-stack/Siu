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
let windowData = { recipientUID: null, maxAmount: 0 };

// 1. مراقبة حالة الدخول
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        document.getElementById('sidebarUserEmail').textContent = user.email;
        loadData();
        observeNotifications(); // بدء مراقبة الإشعارات فور الدخول
    } else {
        window.location.href = 'auth.html';
    }
});

// 2. جلب البيانات
function loadData() {
    onValue(ref(db), (snapshot) => {
        const data = snapshot.val() || {};
        allUsers = data.users ? Object.keys(data.users).map(k => ({uid: k, ...data.users[k]})) : [];
        allExpenses = data.expenses ? Object.values(data.expenses) : [];
        allSettlements = data.settlements ? Object.values(data.settlements) : [];
        
        const currentUser = allUsers.find(u => u.uid === currentUserID);
        if (currentUser) document.getElementById('sidebarUserName').textContent = currentUser.displayName;
        updateUI();
    });
}

// 3. تحديث الواجهة وحساب الأرصدة
function updateUI() {
    let balances = {};
    allUsers.forEach(u => { if(u.uid !== currentUserID) balances[u.uid] = 0; });

    allExpenses.forEach(exp => {
        const share = Number(exp.share) || 0;
        if (exp.payer_id === currentUserID) {
            exp.participants_ids.forEach(pid => { if(pid !== currentUserID) balances[pid] += share; });
        } else if (exp.participants_ids.includes(currentUserID)) {
            balances[exp.payer_id] -= share;
        }
    });

    allSettlements.forEach(set => {
        const amt = Number(set.amount) || 0;
        if (set.payer_id === currentUserID) balances[set.recipient_id] += amt;
        else if (set.recipient_id === currentUserID) balances[set.payer_id] -= amt;
    });

    renderBalances(balances);
}

function renderBalances(balances) {
    const debtContainer = document.getElementById('debtContainer');
    const claimList = document.getElementById('claimList');
    let totalD = 0, totalC = 0;

    debtContainer.innerHTML = '';
    claimList.innerHTML = '';

    Object.keys(balances).forEach(uid => {
        const bal = balances[uid];
        const name = allUsers.find(u => u.uid === uid)?.displayName || "مستخدم";

        if (bal < -0.5) {
            const amt = Math.abs(bal);
            totalD += amt;
            debtContainer.innerHTML += `
                <div class="balance-card">
                    <div class="balance-info"><span class="balance-name">${name}</span><span class="balance-amount text-red-600">${amt.toLocaleString()} SDG</span></div>
                    <button class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm" onclick="showSettleModal('${name}', ${amt}, '${uid}')">تسوية</button>
                </div>`;
        } else if (bal > 0.5) {
            totalC += bal;
            claimList.innerHTML += `<div class="p-2 border-b flex justify-between"><span>${name}</span> <b>${bal.toLocaleString()}</b></div>`;
        }
    });

    document.getElementById('totalDebt').textContent = totalD.toLocaleString();
    document.getElementById('totalCredit').textContent = totalC.toLocaleString();
    document.getElementById('noDebts').classList.toggle('hidden', totalD > 0);
}

// --- ميزات التسوية المضافة ---

window.showSettleModal = (name, amt, uid) => {
    // تنظيف الحقول عند الفتح
    document.getElementById('settleAmount').value = '';
    document.getElementById('operationNumber').value = '';
    document.getElementById('remainingAmountDisplay').textContent = amt.toLocaleString();
    
    windowData = { recipientUID: uid, maxAmount: amt };
    document.getElementById('settleRelation').textContent = `تسوية لـ ${name}`;
    document.getElementById('maxSettleAmountDisplay').textContent = amt.toLocaleString();
    document.getElementById('settleModal').classList.add('show');
};

// حساب المتبقي لحظياً
document.getElementById('settleAmount').addEventListener('input', (e) => {
    const entered = parseFloat(e.target.value) || 0;
    const remaining = windowData.maxAmount - entered;
    const display = document.getElementById('remainingAmountDisplay');
    display.textContent = remaining.toLocaleString();
    display.style.color = remaining < 0 ? "red" : "green";
});

// إرسال التسوية والإشعار
document.getElementById('settleForm').onsubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('settleAmount').value);
    const opNum = document.getElementById('operationNumber').value;

    if (amount <= 0 || amount > windowData.maxAmount + 1) return alert("المبلغ غير صحيح");

    try {
        const updates = {};
        const settleKey = push(ref(db, 'settlements')).key;
        const now = Date.now();
        const dateStr = new Date(now).toLocaleString('ar-EG');

        // 1. بيانات التسوية
        updates[`settlements/${settleKey}`] = {
            payer_id: currentUserID,
            recipient_id: windowData.recipientUID,
            amount: amount,
            operation_number: opNum,
            timestamp: now
        };

        // 2. بيانات الإشعار للطرف الآخر
        const notifKey = push(ref(db, 'notifications')).key;
        updates[`notifications/${notifKey}`] = {
            uid: windowData.recipientUID,
            message: `أرسل لك ${auth.currentUser.displayName} تسوية بمبلغ ${amount} SDG. رقم العملية: ${opNum}`,
            timestamp: now,
            time: dateStr,
            is_read: false
        };

        await update(ref(db), updates);
        alert("تمت العملية وإرسال إشعار للطرف الآخر");
        hideSettleModal();
    } catch (err) { alert("فشلت العملية"); }
};

// --- منطق الإشعارات (الجرس) ---

window.toggleNotifications = () => {
    const panel = document.getElementById('notificationPanel');
    panel.classList.toggle('show');
    // عند فتح القائمة، نعتبر الإشعارات مقروءة
    if (panel.classList.contains('show')) markNotificationsAsRead();
};

function observeNotifications() {
    onValue(ref(db, 'notifications'), (snapshot) => {
        const data = snapshot.val() || {};
        const list = document.getElementById('notificationList');
        const badge = document.getElementById('notificationBadge');
        
        const myNotifs = Object.values(data)
            .filter(n => n.uid === currentUserID)
            .sort((a, b) => b.timestamp - a.timestamp);

        // تحديث الرقم الأحمر (Badge)
        const unreadCount = myNotifs.filter(n => !n.is_read).length;
        badge.textContent = unreadCount;
        badge.classList.toggle('hidden', unreadCount === 0);

        // بناء القائمة
        if (myNotifs.length === 0) {
            list.innerHTML = '<p class="text-center p-4 text-gray-400">لا توجد إشعارات</p>';
        } else {
            list.innerHTML = myNotifs.map(n => `
                <div class="notif-item ${n.is_read ? 'bg-white' : 'bg-blue-50'}">
                    <p class="font-bold text-gray-800">${n.message}</p>
                    <p class="text-xs text-gray-500 mt-1">${n.time}</p>
                </div>
            `).join('');
        }
    });
}

async function markNotificationsAsRead() {
    onValue(ref(db, 'notifications'), (snapshot) => {
        const data = snapshot.val() || {};
        const updates = {};
        Object.keys(data).forEach(key => {
            if (data[key].uid === currentUserID && !data[key].is_read) {
                updates[`notifications/${key}/is_read`] = true;
            }
        });
        if (Object.keys(updates).length > 0) update(ref(db), updates);
    }, { onlyOnce: true });
}

// الوظائف المساعدة
window.hideSettleModal = () => document.getElementById('settleModal').classList.remove('show');
window.showClaimModal = () => document.getElementById('claimModal').classList.add('show');
window.hideClaimModal = () => document.getElementById('claimModal').classList.remove('show');
window.toggleSidebar = () => document.getElementById('sidebar').classList.toggle('open');
window.closeSidebar = () => document.getElementById('sidebar').classList.remove('open');

document.getElementById('logoutBtn').onclick = () => signOut(auth);
document.getElementById('menuButton').onclick = window.toggleSidebar;
