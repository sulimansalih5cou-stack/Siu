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

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        document.getElementById('sidebarUserEmail').textContent = user.email;
        loadData();
        observeNotifications();
    } else {
        window.location.href = 'auth.html';
    }
});

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
            claimList.innerHTML += `
                <div class="p-3 border-b flex justify-between items-center bg-gray-50 mb-2 rounded-xl">
                    <div class="flex flex-col">
                        <span class="font-bold text-gray-800">${name}</span>
                        <span class="text-green-600 font-black">${bal.toLocaleString()} <small>SDG</small></span>
                    </div>
                    <button onclick="nudgeUser('${uid}', '${name}', ${bal})" class="bg-yellow-500 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-yellow-600 transition-colors">
                        <i class="fas fa-hand-point-up ml-1"></i> نكز
                    </button>
                </div>`;
        }
    });

    document.getElementById('totalDebt').textContent = totalD.toLocaleString();
    document.getElementById('totalCredit').textContent = totalC.toLocaleString();
    document.getElementById('noDebts').classList.toggle('hidden', totalD > 0);
}

// --- ميزة النكز (Nudge) ---
window.nudgeUser = async (targetUid, targetName, amount) => {
    try {
        const now = Date.now();
        const dateStr = new Date(now).toLocaleString('ar-EG');
        const notifKey = push(ref(db, 'notifications')).key;
        
        const updateData = {};
        updateData[`notifications/${notifKey}`] = {
            uid: targetUid,
            message: `🔔 نكز: يذكرك ${auth.currentUser.displayName} بسداد مبلغ ${amount.toLocaleString()} SDG مستحقة له.`,
            timestamp: now,
            time: dateStr,
            is_read: false
        };

        await update(ref(db), updateData);
        alert(`تم نكز ${targetName} بنجاح!`);
    } catch (err) {
        alert("فشل إرسال النكز");
    }
};

// --- ميزات التسوية وتنسيق الأرقام ---
window.showSettleModal = (name, amt, uid) => {
    document.getElementById('settleAmount').value = '';
    document.getElementById('operationNumber').value = '';
    document.getElementById('remainingAmountDisplay').textContent = amt.toLocaleString();

    windowData = { recipientUID: uid, maxAmount: amt };
    document.getElementById('settleRelation').textContent = `تسوية لـ ${name}`;
    document.getElementById('maxSettleAmountDisplay').textContent = amt.toLocaleString();
    document.getElementById('settleModal').classList.add('show');
};

// تنسيق الرقم بالفواصل أثناء الكتابة
document.getElementById('settleAmount').addEventListener('input', (e) => {
    // إزالة أي شيء ليس رقماً
    let value = e.target.value.replace(/,/g, '');
    if (value === "") return;

    const numValue = parseFloat(value) || 0;
    
    // حساب المتبقي
    const remaining = windowData.maxAmount - numValue;
    const display = document.getElementById('remainingAmountDisplay');
    display.textContent = remaining.toLocaleString();
    display.style.color = remaining < 0 ? "#EF4444" : "#10B981";

    // إعادة وضع الفواصل في الحقل (اختياري بصرياً)
    // ملاحظة: إذا كان الحقل type="number" لا يمكن وضع فواصل، لذا يفضل تحويله لـ type="text" في HTML
    if (e.target.type === 'text') {
        e.target.value = numValue.toLocaleString();
    }
});

document.getElementById('settleForm').onsubmit = async (e) => {
    e.preventDefault();
    // الحصول على الرقم الصافي بدون فواصل
    let rawValue = document.getElementById('settleAmount').value.replace(/,/g, '');
    const amount = parseFloat(rawValue);
    const opNum = document.getElementById('operationNumber').value;

    if (amount <= 0 || amount > windowData.maxAmount + 5) return alert("المبلغ غير صحيح");

    try {
        const updates = {};
        const settleKey = push(ref(db, 'settlements')).key;
        const now = Date.now();
        const dateStr = new Date(now).toLocaleString('ar-EG');

        updates[`settlements/${settleKey}`] = {
            payer_id: currentUserID,
            recipient_id: windowData.recipientUID,
            amount: amount,
            operation_number: opNum,
            timestamp: now
        };

        const notifKey = push(ref(db, 'notifications')).key;
        updates[`notifications/${notifKey}`] = {
            uid: windowData.recipientUID,
            message: `✅ وصلتك تسوية: قام ${auth.currentUser.displayName} بدفع ${amount.toLocaleString()} SDG. رقم العملية: ${opNum}`,
            timestamp: now,
            time: dateStr,
            is_read: false
        };

        await update(ref(db), updates);
        alert("تمت العملية بنجاح");
        hideSettleModal();
    } catch (err) { alert("فشلت العملية"); }
};

// --- منطق الإشعارات المحسن ---
window.showNotifications = () => {
    document.getElementById('notificationModal').classList.add('show');
    markNotificationsAsRead(); // قراءة بمجرد النظر (فتح المودال)
};

function observeNotifications() {
    onValue(ref(db, 'notifications'), (snapshot) => {
        const data = snapshot.val() || {};
        const list = document.getElementById('notificationsList');
        const badge = document.getElementById('notificationBadge');

        const myNotifs = Object.values(data)
            .filter(n => n.uid === currentUserID)
            .sort((a, b) => b.timestamp - a.timestamp);

        const unreadCount = myNotifs.filter(n => !n.is_read).length;
        badge.textContent = unreadCount;
        badge.classList.toggle('hidden', unreadCount === 0);

        if (myNotifs.length === 0) {
            list.innerHTML = '<div class="text-center py-10 text-gray-400">لا توجد إشعارات حالياً</div>';
        } else {
            list.innerHTML = myNotifs.map(n => `
                <div class="p-4 rounded-2xl mb-2 flex flex-col transition-all ${n.is_read ? 'bg-gray-50 border border-gray-100' : 'bg-blue-50 border-r-4 border-blue-500 shadow-sm'}">
                    <p class="text-sm font-bold text-gray-800 leading-relaxed">${n.message}</p>
                    <span class="text-[10px] text-gray-400 mt-2 self-start"><i class="far fa-clock ml-1"></i>${n.time}</span>
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
window.hideNotificationModal = () => document.getElementById('notificationModal').classList.remove('show');

document.getElementById('logoutBtn').onclick = () => signOut(auth);
