// 🔥 الاستيرادات الصحيحة عبر CDN لـ Firebase V9
// نستخدم هذه الروابط لضمان عمل الكود في المتصفح مع type="module"
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// 🛑 إعدادات Firebase الخاصة بك (من الكود الذي أرسلته)
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

// تهيئة Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// المتغيرات العامة التي تحمل حالة التطبيق
let allUsers = [];
let currentUserID = null;
let currentUserDB = null;
let allExpenses = [];
let allNotifications = [];
let pendingExpense = null; // لتخزين بيانات المصروف قبل الحفظ

// ============================================================
// 🛠️ دوال مساعدة عامة
// ============================================================

function getUserNameById(uid) {
    const user = allUsers.find(u => u.uid === uid);
    return user ? user.displayName : 'مستخدم';
}

function roundToTwo(num) {
    return Math.round(num * 100) / 100;
}

function formatBankDate(timestamp) {
    if (!timestamp) return { date: '--', time: '--' };
    const dateObj = new Date(timestamp);
    return {
        date: dateObj.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }),
        time: dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })
    };
}

// تنسيق الأرقام في الحقول
window.formatNumber = function(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') input.value = parseFloat(value).toLocaleString('en-US');
};

// إغلاق النوافذ المنبثقة (Modals)
window.hideModal = () => document.getElementById('previewModal').classList.remove('show');
window.hideSuccessModal = () => document.getElementById('successModal').classList.remove('show');
window.hideNotificationModal = () => document.getElementById('notificationModal').classList.remove('show');

// ============================================================
// 🎨 تحديث الواجهة العامة (يناسب تصميم index.html)
// ============================================================

function updateCommonUI() {
    // تحديث بطاقة الرصيد والاسم
    const balanceEl = document.getElementById('currentBalance');
    const nameEl = document.getElementById('userNamePlaceholder');
    const cardEl = document.getElementById('currentBalanceCard');

    if (balanceEl && nameEl && cardEl) {
        let displayName = currentUserDB ? currentUserDB.displayName : (auth.currentUser ? auth.currentUser.displayName : "مستخدم");
        nameEl.textContent = displayName;

        const balance = currentUserDB ? currentUserDB.balance : 0;
        balanceEl.textContent = balance.toLocaleString('en-US', {minimumFractionDigits: 1});

        if (balance < -0.1) cardEl.classList.add('negative');
        else cardEl.classList.remove('negative');
    }

    // تحديث شارة الإشعارات
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        const unreadCount = allNotifications.filter(n => n.recipientId === currentUserID && !n.read).length;
        badge.style.display = unreadCount > 0 ? 'block' : 'none';
    }
}

// ============================================================
// 🏠 منطق صفحة إضافة مصروف (Home Logic)
// ============================================================

function populateParticipants() {
    const container = document.getElementById('participantsCheckboxes');
    if (!container) return;
    container.innerHTML = '';

    allUsers.filter(u => u.uid !== currentUserID).forEach(user => {
        const div = document.createElement('label');
        div.className = 'checkbox-item';
        div.innerHTML = `
            <input type="checkbox" data-uid="${user.uid}" class="form-checkbox h-4 w-4 text-blue-600 rounded">
            <span class="mr-2 text-sm">${user.displayName}</span>
        `;
        container.appendChild(div);
    });
}

// تحديد الجميع
window.selectAllParticipants = function() {
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);
};

// ============================================================
// 💾 منطق المعاينة والحفظ (Save & Preview)
// ============================================================

window.previewExpense = function() {
    const title = document.getElementById('expenseTitle').value;
    const amountStr = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(amountStr);

    if (!title || isNaN(amount) || amount <= 0) {
        alert('الرجاء إدخال اسم ومبلغ المصروف بشكل صحيح.');
        return;
    }

    const checkboxes = document.querySelectorAll('#participantsCheckboxes input:checked');
    const participants = Array.from(checkboxes).map(cb => cb.getAttribute('data-uid'));
    const totalParticipantsList = [...participants, currentUserID]; // الدافع + المشاركون
    const share = roundToTwo(amount / totalParticipantsList.length);

    // تجهيز نص المعاينة
    const text = `
        <ul class="list-disc pr-4 space-y-2 text-right" dir="rtl">
            <li><b>المصروف:</b> ${title}</li>
            <li><b>المبلغ:</b> ${amount.toLocaleString()} SDG</li>
            <li><b>عدد المشاركين:</b> ${totalParticipantsList.length}</li>
            <li><b>نصيب الفرد:</b> ${share.toLocaleString(undefined, {maximumFractionDigits: 1})} SDG</li>
        </ul>
    `;
    document.getElementById('previewText').innerHTML = text;

    pendingExpense = { title, amount, participants, share };

    // إظهار تحذير التكرار
    const today = new Date().toISOString().split('T')[0];
    const isDuplicate = allExpenses.some(e => e.date === today && e.title === title && e.amount === amount);
    const warningEl = document.getElementById('warning');
    if(warningEl) warningEl.style.display = isDuplicate ? 'block' : 'none';

    document.getElementById('previewModal').classList.add('show');
};

// الدالة الحاسمة: تسجيل المصروف وتعديل الأرصدة
window.saveExpense = async function() {
    window.hideModal();
    if (!pendingExpense) return;
    const { title, amount, participants, share } = pendingExpense;

    const updates = {};
    const newKey = push(ref(db, 'expenses')).key;
    const payerName = currentUserDB ? currentUserDB.displayName : 'أنت';

    // 1. تسجيل المصروف في عقدة /expenses
    updates[`expenses/${newKey}`] = {
        title, amount, share,
        payer_id: currentUserID,
        participants_ids: [...participants, currentUserID],
        timestamp: Date.now(),
        date: new Date().toISOString().split('T')[0]
    };

    // 2. تحديث أرصدة المستخدمين وإرسال الإشعارات
    allUsers.forEach(user => {
        let bal = user.balance || 0;

        if (user.uid === currentUserID) {
            // الدافع: يكسب المبلغ الكلي مطروحاً منه حصته
            bal += (amount - share);
        }
        else if (participants.includes(user.uid)) {
            // المشارك: يُخصم منه حصته (يصبح مديناً للدافع)
            bal -= share;

            // إرسال إشعار للمشارك
            const notifKey = push(ref(db, 'notifications')).key;
            updates[`notifications/${notifKey}`] = {
                recipientId: user.uid,
                message: `${payerName} اشترى "${title}". حصتك: ${share} SDG`,
                timestamp: Date.now(), read: false
            };
        }

        // تحديث الرصيد النهائي
        updates[`users/${user.uid}/balance`] = roundToTwo(bal);
    });

    try {
        // 3. إرسال جميع التحديثات دفعة واحدة إلى Firebase
        await update(ref(db), updates);
        document.getElementById('successModal').classList.add('show');
        document.getElementById('expenseForm').reset();
        document.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = false);
        pendingExpense = null;
    } catch (e) {
        console.error("Firebase Update Error:", e);
        // هذه رسالة مهمة تشير إلى أن الخطأ غالباً في قواعد الأمان
        alert('فشل تسجيل المصروف. يرجى التحقق من قواعد الأمان في Firebase (Realtime Database Rules).');
    }
};

// ============================================================
// 🔔 منطق الإشعارات (Notifications)
// ============================================================

window.openNotificationModal = function() {
    const list = document.getElementById('notificationsList');
    const modal = document.getElementById('notificationModal');
    if(!list || !modal) return;

    const myNotifs = allNotifications.filter(n => n.recipientId === currentUserID).sort((a,b) => b.timestamp - a.timestamp);

    let html = '';
    if(myNotifs.length === 0) html = '<p class="text-center text-gray-400">لا توجد إشعارات.</p>';
    myNotifs.forEach(n => {
        const { date } = formatBankDate(n.timestamp);
        html += `<div class="p-3 rounded border ${n.read ? 'bg-gray-50' : 'bg-blue-50 border-blue-200'}"><p class="text-sm">${n.message}</p><span class="text-xs text-gray-400">${date}</span></div>`;
    });
    list.innerHTML = html;
    modal.classList.add('show');
};

window.markAllAsRead = async function() {
    const updates = {};
    allNotifications.filter(n => n.recipientId === currentUserID && !n.read).forEach(n => {
        updates[`notifications/${n.firebaseId}/read`] = true;
    });
    await update(ref(db), updates);
};

// ============================================================
// 🔄 تحميل البيانات والمصادقة (Load Data & Auth)
// ============================================================

function loadData() {
    if (!currentUserID) return;

    // جلب المستخدمين (Users)
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allUsers = Object.keys(val).map(k => ({uid: k, ...val[k]}));
            currentUserDB = allUsers.find(u => u.uid === currentUserID);

            updateCommonUI();
            populateParticipants();
        }
    });

    // جلب المصروفات (Expenses)
    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allExpenses = Object.keys(val).map(key => ({ firebaseId: key, ...val[key] })).sort((a, b) => b.timestamp - a.timestamp);
        } else {
            allExpenses = [];
        }
    });

    // جلب الإشعارات (Notifications)
    onValue(ref(db, 'notifications'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allNotifications = Object.keys(val).map(key => ({ firebaseId: key, ...val[key] }));
            updateCommonUI();
        } else {
            allNotifications = [];
            updateCommonUI();
        }
    });
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        loadData();

        const logoutBtn = document.getElementById('logoutButton');
        if (logoutBtn) logoutBtn.onclick = () => auth.signOut().then(() => window.location.href = 'auth.html');

    } else {
        // إعادة التوجيه لصفحة الدخول إذا لم يكن المستخدم مسجلاً
        if (!window.location.href.includes('auth.html')) {
            window.location.href = 'auth.html';
        }
    }
});
