// 🔥 تهيئة واستيراد Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
// لم نعد نحتاج Storage هنا
// import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";


// 🛑 إعدادات Firebase
// **الرجاء التأكد من وضع إعدادات مشروعك الحقيقية هنا**
const firebaseConfig = {
  apiKey: "AIzaSyA2GNsXj4DzWyCYLKuVT3i1XBKfjX3ccuM",
  authDomain: "siu-students.firebaseapp.com",
  databaseURL: "https://siu-students-default-rtdb.firebaseio.com",
  projectId: "siu-students",
  messagingSenderId: "76007314543",
  appId: "1:76007314543:web:4850b668cec4b4850b668cec4b93bdc699a",
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
let allNotifications = []; // سجل الإشعارات

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

window.formatNumber = function(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') {
        input.value = parseFloat(value).toLocaleString('en-US'); 
    }
};

function formatBankDate(timestamp) {
    if (!timestamp) return { date: '--', time: '--' };
    const dateObj = new Date(timestamp);
    const date = dateObj.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });
    const time = dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });
    return { date, time };
}

window.hideSuccessModal = () => {
    document.getElementById('successModal').classList.remove('show');
};

window.hideModal = () => { 
    document.getElementById('previewModal').classList.remove('show');
};

// ============================================================
// 🏠 منطق الصفحة الرئيسية (index.html)
// ============================================================

function updateHomeDisplay() {
    // 1. تحديث بطاقة الرصيد الكلي
    const balanceEl = document.getElementById('currentBalance');
    const nameEl = document.getElementById('userNamePlaceholder');
    const cardEl = document.getElementById('currentBalanceCard');
    if (!balanceEl) return; 

    let displayName = (currentUserDB && currentUserDB.displayName) ? currentUserDB.displayName : (auth.currentUser ? auth.currentUser.displayName : "مستخدم");
    if (nameEl) nameEl.textContent = displayName;

    const balance = (currentUserDB && currentUserDB.balance) ? currentUserDB.balance : 0;
    balanceEl.textContent = balance.toLocaleString('en-US', {minimumFractionDigits: 1});

    if (balance < -0.1) cardEl.classList.add('negative');
    else cardEl.classList.remove('negative');
    
    // 2. تحديث قسم مصروفاتي الشخصية
    displayMyExpensesSummary();
    
    // 3. تحديث قائمة المشاركين (إذا كنا في index.html)
    if (document.getElementById('participantsCheckboxes')) {
        populateParticipants();
    }
}

function populateParticipants() {
    const container = document.getElementById('participantsCheckboxes');
    if (!container) return;
    container.innerHTML = '';
    
    // فرز المستخدمين لإزالة المستخدم الحالي
    const otherUsers = allUsers.filter(u => u.uid !== currentUserID);
    
    if (otherUsers.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 mt-2">لا يوجد مستخدمون آخرون.</p>';
        return;
    }
    
    otherUsers.forEach(user => {
        const div = document.createElement('label');
        div.className = 'checkbox-item';
        div.innerHTML = `
            <input type="checkbox" data-uid="${user.uid}" class="form-checkbox h-4 w-4 text-blue-600 rounded">
            <span class="mr-2 text-sm">${user.displayName}</span>
        `;
        // يجب أن يكون المستخدم الحالي هو الدافع دائماً، والمشاركون هم الآخرون
        container.appendChild(div);
    });
}

window.selectAllParticipants = function() {
    document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]').forEach(cb => cb.checked = true);
};

// ============================================================
// 💸 منطق قسم مصروفاتي الشخصية (الطلب الجديد)
// ============================================================

function displayMyExpensesSummary() {
    const totalMyExpensesEl = document.getElementById('totalMyExpenses');
    const historyContainer = document.getElementById('myExpenseHistory');
    
    if (!totalMyExpensesEl || !historyContainer) return;

    let totalMyShare = 0;
    let myExpensesList = [];

    // تجميع المصروفات التي شارك فيها المستخدم
    allExpenses.forEach(expense => {
        if (expense.participants_ids.includes(currentUserID)) {
            const myShare = expense.share;
            totalMyShare = roundToTwo(totalMyShare + myShare);
            
            // إضافة المصروف للسجل التفصيلي
            myExpensesList.push({
                ...expense,
                myShare: myShare
            });
        }
    });

    // 1. تحديث الإجمالي في الأعلى
    totalMyExpensesEl.textContent = totalMyShare.toLocaleString('en-US', {minimumFractionDigits: 1});

    // 2. عرض سجل المصروفات الفردية
    historyContainer.innerHTML = '';
    
    if (myExpensesList.length === 0) {
        historyContainer.innerHTML = '<p class="text-center text-gray-400 mt-2">لا توجد مصروفات شخصية مسجلة بعد.</p>';
        return;
    }

    // فرز المصروفات حسب الأحدث أولاً
    myExpensesList.sort((a, b) => b.timestamp - a.timestamp);

    myExpensesList.forEach(item => {
        const payerName = getUserNameById(item.payer_id);
        const { date, time } = formatBankDate(item.timestamp);
        const shareStr = item.myShare.toLocaleString('en-US', {minimumFractionDigits: 1});
        
        // الرسالة المطلوبة: تم صرف 1,000 شاي
        const message = item.title;
        
        const cardHTML = `
            <div class="expense-item-card">
                <div class="text-right">
                    <p class="font-bold text-gray-800">${message}</p>
                    <span class="text-xs">
                        <i class="far fa-calendar-alt ml-1"></i> ${date} - <i class="far fa-clock ml-1"></i> ${time}
                    </span>
                    <span class="block mt-1 text-xs text-gray-500">
                         ${item.payer_id === currentUserID ? 'أنت الدافع' : `الدافع: ${payerName}`}
                    </span>
                </div>
                <div class="text-left flex flex-col items-end">
                    <strong class="dir-ltr">- ${shareStr} SDG</strong>
                    <span class="text-xs text-red-500">(حصتك)</span>
                </div>
            </div>
        `;
        historyContainer.innerHTML += cardHTML;
    });
}


// ============================================================
// 🔔 منطق الإشعارات (Notifications Logic) - طلب جديد
// ============================================================

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;

    const unreadCount = allNotifications.filter(n => n.recipientId === currentUserID && !n.read).length;

    if (unreadCount > 0) {
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

window.openNotificationModal = function() {
    const modal = document.getElementById('notificationModal');
    const list = document.getElementById('notificationsList');
    if (!modal) return;

    list.innerHTML = '';
    
    // فلترة وعرض الإشعارات الخاصة بالمستخدم الحالي فقط
    const userNotifications = allNotifications
        .filter(n => n.recipientId === currentUserID)
        .sort((a, b) => b.timestamp - a.timestamp); // الأحدث أولاً

    if (userNotifications.length === 0) {
        list.innerHTML = '<p class="text-gray-500 text-center py-4">لا توجد إشعارات جديدة.</p>';
    } else {
        userNotifications.forEach(notification => {
            const { date, time } = formatBankDate(notification.timestamp);
            const bgColor = notification.read ? 'bg-gray-100' : 'bg-blue-50'; // لون للخلفية غير المقروءة
            const fontWeight = notification.read ? 'font-normal' : 'font-semibold'; // خط عريض لغير المقروء

            list.innerHTML += `
                <div class="${bgColor} p-3 rounded-lg border border-gray-200 text-sm ${fontWeight}">
                    <p class="text-gray-800">${notification.message}</p>
                    <span class="text-xs text-gray-500 mt-1 block">
                        <i class="far fa-calendar-alt ml-1"></i> ${date} - <i class="far fa-clock ml-1"></i> ${time}
                    </span>
                </div>
            `;
        });
    }

    modal.classList.add('show');
};

window.hideNotificationModal = () => document.getElementById('notificationModal').classList.remove('show');

window.markAllAsRead = async function() {
    const updates = {};
    const unreadNotifications = allNotifications.filter(n => n.recipientId === currentUserID && !n.read);

    if (unreadNotifications.length === 0) return;

    unreadNotifications.forEach(n => {
        updates[`notifications/${n.firebaseId}/read`] = true;
    });

    try {
        await update(ref(db), updates);
        // لا نحتاج تحديث الواجهة هنا، onValue سيتولى الأمر
        alert('تم وضع كل الإشعارات كمقروءة.');
    } catch (error) {
        console.error("Error marking notifications as read:", error);
    }
}

/**
 * دالة لإنشاء إشعار لمستخدم معين
 * @param {string} recipientId - UID للمستخدم المستقبل
 * @param {string} message - نص الإشعار
 */
async function createNotification(recipientId, message) {
    if (!recipientId || !message) return;
    
    const newNotification = {
        recipientId: recipientId,
        message: message,
        timestamp: Date.now(),
        read: false 
    };
    
    try {
        await push(ref(db, 'notifications'), newNotification);
    } catch (error) {
        console.error("Error creating notification:", error);
    }
}


// ============================================================
// 💾 منطق حفظ المصروف (Save Expense Logic)
// ============================================================

window.previewExpense = function() {
    const title = document.getElementById('expenseTitle').value.trim();
    const amountStr = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(amountStr);
    
    // المستخدم الحالي هو الدافع دائماً
    const participants = Array.from(document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]:checked'))
                               .map(cb => cb.dataset.uid);
    
    // إضافة المستخدم الحالي لقائمة المشاركين
    participants.push(currentUserID);
    
    if (!title || !amount || isNaN(amount) || amount <= 0) {
        alert('الرجاء إدخال اسم المصروف والمبلغ بشكل صحيح.');
        return;
    }
    if (participants.length === 0) {
        alert('يجب اختيار مشارك واحد على الأقل (أنت مشارك دائماً).');
        return;
    }

    const totalParticipants = participants.length;
    const share = roundToTwo(amount / totalParticipants);
    const totalDeduction = roundToTwo(share * (totalParticipants - 1)); // ما يطلبه الدافع من الآخرين
    
    // التحقق من المصروف المكرر (اختياري)
    const isDuplicate = allExpenses.some(e => e.title === title && e.amount === amount && e.timestamp > Date.now() - 3600000); // خلال آخر ساعة
    document.getElementById('warning').style.display = isDuplicate ? 'block' : 'none';

    // عرض التفاصيل في الـ Modal
    const previewText = document.getElementById('previewText');
    const payerName = currentUserDB.displayName || 'أنت';
    
    previewText.innerHTML = `
        <p><strong>الدافع:</strong> ${payerName} (أنت)</p>
        <p><strong>المصروف:</strong> ${title}</p>
        <p><strong>المبلغ الكلي:</strong> ${amount.toLocaleString('en-US', {minimumFractionDigits: 1})} SDG</p>
        <p><strong>عدد المشاركين:</strong> ${totalParticipants} شخص</p>
        <p><strong>حصة كل شخص:</strong> <span class="text-lg font-bold text-red-600 dir-ltr">${share.toLocaleString('en-US', {minimumFractionDigits: 1})} SDG</span></p>
        <p class="mt-3 font-semibold text-blue-600">
            سيتم خصم ${totalDeduction.toLocaleString('en-US', {minimumFractionDigits: 1})} SDG من رصيدك الكلي وإضافتها للمشاركين.
        </p>
        <p class="mt-3 text-sm italic text-gray-500">المشاركون: ${participants.map(uid => getUserNameById(uid)).join(', ')}</p>
    `;

    // تخزين بيانات المصروف مؤقتاً قبل الحفظ
    document.getElementById('previewModal').dataset.expenseData = JSON.stringify({
        title, amount, participants, totalParticipants, share
    });

    document.getElementById('previewModal').classList.add('show');
};

window.saveExpense = async function() {
    const expenseDataStr = document.getElementById('previewModal').dataset.expenseData;
    if (!expenseDataStr) return;

    const data = JSON.parse(expenseDataStr);
    const { title, amount, participants, totalParticipants, share } = data;
    const now = Date.now();
    
    window.hideModal(); 

    try {
        // 1. إنشاء المصروف في قاعدة البيانات
        const newExpense = {
            title: title,
            amount: amount,
            payer_id: currentUserID, // أنت الدافع
            participants_ids: participants,
            share: share,
            timestamp: now
        };

        const newExpenseRef = push(ref(db, 'expenses'), newExpense);
        const newExpenseId = newExpenseRef.key;

        // 2. تحديث أرصدة جميع المشاركين (بما فيهم الدافع)
        const updates = {};
        const payerOldBalance = currentUserDB.balance;
        let newPayerBalance = payerOldBalance + roundToTwo(amount - share); // الدافع يحصل على المبلغ الكلي مطروحاً منه حصته

        updates[`users/${currentUserID}/balance`] = roundToTwo(newPayerBalance);
        
        // إعداد الإشعارات
        const payerName = currentUserDB.displayName || 'الدافع';

        participants.forEach(uid => {
            if (uid !== currentUserID) {
                // تحديث رصيد المشاركين الآخرين
                const participant = allUsers.find(u => u.uid === uid);
                if (participant) {
                    const newBalance = roundToTwo(participant.balance - share);
                    updates[`users/${uid}/balance`] = newBalance;
                }
                
                // إنشاء إشعار للمشاركين
                const notificationMessage = `${payerName} اشترى "${title}" بقيمة ${amount.toLocaleString('en-US')} SDG، وحصتك هي ${share.toLocaleString('en-US')} SDG.`;
                createNotification(uid, notificationMessage);
            }
        });

        // تنفيذ التحديثات في خطوة واحدة
        await update(ref(db), updates);
        
        // 3. عرض رسالة النجاح وإعادة ضبط النموذج
        document.getElementById('successModal').classList.add('show');
        document.getElementById('expenseForm').reset();
        document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
        
        loadData(); // إعادة تحميل البيانات المحدثة

    } catch (e) {
        console.error("Error saving expense:", e);
        alert('حدث خطأ أثناء حفظ المصروف. الرجاء المحاولة مجدداً.');
    }
};

// ============================================================
// 🔐 المصادقة والبداية (Entry Point)
// ============================================================

function initializePage() {
    if (document.getElementById('expenseForm')) {
        updateHomeDisplay();
    } 
    // إذا كنت في صفحة السجل (history.html)، هذه الدالة غير ضرورية هنا، لكنها موجودة في ملف history.js/script.js الخاص بها
}

function loadData() {
    if (!currentUserID) return;

    // 1. تحميل المستخدمين
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allUsers = Object.keys(val).map(k => ({uid: k, ...val[k]}));
            currentUserDB = allUsers.find(u => u.uid === currentUserID);
            initializePage();
        }
    });

    // 2. تحميل المصروفات
    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allExpenses = Object.keys(val).map(key => ({ firebaseId: key, ...val[key] })).sort((a, b) => b.timestamp - a.timestamp);
            initializePage();
        } else {
            allExpenses = [];
            initializePage(); 
        }
    });
    
    // 3. تحميل الإشعارات
     onValue(ref(db, 'notifications'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allNotifications = Object.keys(val).map(key => ({ firebaseId: key, ...val[key] }));
            updateNotificationBadge();
        } else {
            allNotifications = [];
            updateNotificationBadge();
        }
    });
}

// ربط رابط الإشعارات بالدالة
document.addEventListener('DOMContentLoaded', () => {
    const notificationLink = document.getElementById('notificationLink');
    if (notificationLink) {
        notificationLink.onclick = (e) => {
            e.preventDefault();
            window.openNotificationModal();
        };
    }
});


onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        
        const headerName = document.getElementById('userNamePlaceholder');
        if (headerName) headerName.textContent = user.displayName || 'مستخدم';

        loadData();

        const logoutBtn = document.getElementById('logoutButton');
        if (logoutBtn) logoutBtn.onclick = () => auth.signOut().then(() => window.location.href = 'auth.html');

    } else {
        if (!window.location.href.includes('auth.html')) {
            window.location.href = 'auth.html';
        }
    }
});