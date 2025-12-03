// 🔥 تهيئة واستيراد Firebase SDK
// يجب التأكد من صحة إصدارات المكتبات وروابطها
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// 🛑 إعدادات Firebase - يجب تغيير هذه القيم إلى إعدادات مشروعك
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

try {
    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);
    const auth = getAuth(app);
    window.db = db;
    window.auth = auth;
} catch (e) {
    console.error("Firebase Initialization Error: Check your firebaseConfig object.", e);
    alert("خطأ حاسم في تهيئة الاتصال بقاعدة البيانات. تحقق من إعدادات Firebase.");
}


// متغيرات عامة
let allUsers = [];
let currentUserID = null;
let currentUserDB = null;
let allExpenses = [];
let userNotifications = [];
let allSettlements = [];
let netBalances = {};

// ✨ متغيرات التحكم في الفلاتر والتحميل الكسول
let activeFilter = '30days'; // الفلتر النشط الافتراضي
let historyDisplayLimit = 10; // عدد السجلات التي يتم عرضها في كل مرة (للتسريع)
let currentHistoryIndex = 0; // مؤشر بداية العرض

// متغيرات مودال التسوية
let currentSettleUser = '';
let currentSettleMaxAmount = 0;
let currentSettleRecipientUID = ''; 

// ============================================================
// 🛠️ دوال مساعدة عامة
// ============================================================
function getUserNameById(uid) {
    const user = allUsers.find(u => u.uid === uid);
    return user ? user.displayName : 'مستخدم غير معروف';
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
    const day = dateObj.getDate();
    const month = dateObj.toLocaleString('ar-EG', { month: 'short' });
    const year = dateObj.getFullYear();
    const date = `${day}-${month}-${year}`;
    const time = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return { date, time };
}

// ============================================================
// 🏠 منطق الصفحة الرئيسية (Home Logic) - (تم اختصاره)
// ============================================================
function updateHomeDisplay() {
    // ... (منطق تحديث اسم المستخدم والرصيد في الصفحة الرئيسية)
    const nameEl = document.getElementById('userNamePlaceholder');
    const sidebarName = document.getElementById('sidebarUserName');
    const sidebarEmail = document.getElementById('sidebarUserEmail');
    const displayHeaderName = document.getElementById('displayHeaderName');
    const displayHeaderEmail = document.getElementById('displayHeaderEmail');

    let displayName = "مستخدم";
    if (currentUserDB && currentUserDB.displayName) displayName = currentUserDB.displayName;
    else if (auth.currentUser && auth.currentUser.displayName) displayName = auth.currentUser.displayName;

    if (nameEl) nameEl.textContent = displayName;
    if (sidebarName) sidebarName.textContent = displayName;
    if (displayHeaderName) displayHeaderName.textContent = displayName;
    
    if (sidebarEmail && auth.currentUser) sidebarEmail.textContent = auth.currentUser.email || '';
    if (displayHeaderEmail && auth.currentUser) displayHeaderEmail.textContent = auth.currentUser.email || '';
}

function populateParticipants() {
    // ... (منطق تعبئة المشاركين في صفحة الإضافة)
}

// ============================================================
// 📜 منطق سجل التاريخ الموحد والمقسم (History Logic)
// ============================================================

// دالة مساعد: لتحديد تاريخ البدء حسب الفلتر
function getFilterStartDate(filter) {
    const now = new Date();
    switch (filter) {
        case '30days':
            now.setDate(now.getDate() - 30);
            return now.getTime();
        case '3months':
            now.setMonth(now.getMonth() - 3);
            return now.getTime();
        case 'all':
        case 'incoming':
        case 'outgoing':
        default:
            return 0; // لا يوجد تصفية زمنية إضافية للكل
    }
}

// دالة تطبيق الفلتر (المرتبطة بأزرار HTML)
window.setFilter = function(filter, element) {
    // تحديث الفلتر النشط
    activeFilter = filter;
    
    // تحديث شكل الأزرار في واجهة المستخدم
    document.querySelectorAll('.filter-pill').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');

    // إعادة تحميل السجل من البداية
    currentHistoryIndex = 0;
    displayHistory(false); // إعادة عرض
}

// دالة عرض سجلات التاريخ الموحدة والمقسمة (Pagination)
function displayHistory(isLoadMore = false) {
    const container = document.getElementById('expensesContainer');
    const loadMoreBtn = document.getElementById('loadMoreHistory');
    
    if (!container) return;
    
    // إذا لم يكن هناك تحميل إضافي، اعرض شاشة التحميل/الفرز
    if (!isLoadMore) {
        container.innerHTML = `
            <p class="text-center text-gray-400 mt-12">
                <i class="fas fa-spinner fa-spin fa-2x mb-4"></i><br>
                جاري تصفية وتحميل السجلات...
            </p>`;
    }

    // 1. دمج المصروفات والتسويات وفرزها
    const combinedHistory = [
        ...allExpenses.map(item => ({...item, type: 'expense', timestamp: item.timestamp, id: item.firebaseId })),
        ...allSettlements.map(item => ({...item, type: 'settlement', timestamp: item.timestamp, id: item.firebaseId }))
    ].sort((a, b) => b.timestamp - a.timestamp);

    // 2. تطبيق التصفية الزمنية (التاريخ) أولاً
    const startDate = getFilterStartDate(activeFilter);
    let filteredHistory = combinedHistory.filter(item => item.timestamp >= startDate);

    // 3. تطبيق التصفية حسب النوع (وارد/صادر)
    if (activeFilter === 'incoming') {
        // واردة (لك): أنت مستلم تسوية OR أنت دائن (دافع) في مصروف
        filteredHistory = filteredHistory.filter(item => {
            if (item.type === 'settlement') return item.recipient_id === currentUserID;
            if (item.type === 'expense') return item.payer_id === currentUserID; 
            return false;
        });
    } else if (activeFilter === 'outgoing') {
        // صادرة (عليك): أنت دافع تسوية OR أنت مدين في مصروف
        filteredHistory = filteredHistory.filter(item => {
            if (item.type === 'settlement') return item.payer_id === currentUserID;
            if (item.type === 'expense') return item.participants_ids.includes(currentUserID) && item.payer_id !== currentUserID;
            return false;
        });
    }

    // 4. تطبيق التحميل الكسول (Pagination)
    const itemsToDisplay = filteredHistory.slice(currentHistoryIndex, currentHistoryIndex + historyDisplayLimit);
    
    if (!isLoadMore) {
        container.innerHTML = ''; 
    }

    if (filteredHistory.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-4 mt-8">لا توجد سجلات مطابقة لمعايير البحث حالياً.</p>';
        if(loadMoreBtn) loadMoreBtn.classList.add('hidden');
        return;
    }

    itemsToDisplay.forEach(item => {
        const { date, time } = formatBankDate(item.timestamp);
        let cardHTML = '';
        
        if (item.type === 'settlement') {
            // سجل التسوية بلون مميز (أصفر)
            const recipientName = getUserNameById(item.recipient_id);
            const payerName = getUserNameById(item.payer_id);
            const isPayer = item.payer_id === currentUserID;

            const mainTitle = isPayer ? `تسوية دين دفعتها لـ ${recipientName}` : `تسوية دين استلمتها من ${payerName}`;
            const amountDisplay = item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const sign = isPayer ? '-' : '+';
            const amountClass = isPayer ? 'amount-neg' : 'amount-pos';
            const iconClass = isPayer ? 'fa-arrow-circle-up text-red-500' : 'fa-arrow-circle-down text-green-500';
            const bgClass = 'bg-yellow-50 border-yellow-300'; 

            cardHTML = `
                <div class="bankak-card ${bgClass}" data-id="${item.id}" data-type="settlement">
                    <div class="card-main-content">
                        <div class="details-wrapper">
                            <div class="bank-icon-container ml-3" style="border-color: #FBBF24; color: #FBBF24;">
                                <i class="fas ${iconClass}"></i>
                            </div>
                            <div class="details-text text-right">
                                <p class="transaction-title">تسوية (عملية رقم: ${item.operation_number})</p>
                                <p class="transaction-sub"> ${mainTitle} </p>
                            </div>
                        </div>
                        <div class="amount-display ${amountClass}"> ${sign} ${amountDisplay} <span class="text-sm font-normal">SDG</span> </div>
                    </div>
                    <div class="card-footer-date">
                        <span><i class="far fa-calendar-alt ml-1"></i> ${date}</span>
                        <span><i class="far fa-clock ml-1"></i> ${time}</span>
                    </div>
                </div>
            `;

        } else if (item.type === 'expense') {
            // سجل المصروفات
            const isPayer = item.payer_id === currentUserID;
            const myShare = item.participants_ids.includes(currentUserID) ? item.share : 0;
            const participantsCount = item.participants_ids.length;

            let mainTitle, amountDisplay, sign, amountClass, iconClass;
            
            if (isPayer) {
                // أنا الدافع: عرض المبلغ الكلي للمصروف
                mainTitle = participantsCount > 1 ? `دفعت لـ ${participantsCount - 1} آخرين. إجمالي المصروف: ${item.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} SDG` : `دفعت كامل المصروف: ${item.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} SDG`;
                amountDisplay = item.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 });
                sign = '+';
                amountClass = 'amount-pos';
                iconClass = 'fa-plus-circle text-green-500';
            } else if (item.participants_ids.includes(currentUserID)) {
                // أنا مدين: عرض حصتي
                const payerName = getUserNameById(item.payer_id);
                mainTitle = `دين عليك لـ ${payerName}. حصتك: ${myShare.toLocaleString(undefined, { minimumFractionDigits: 2 })} SDG`;
                amountDisplay = myShare.toLocaleString(undefined, { minimumFractionDigits: 2 });
                sign = '-';
                amountClass = 'amount-neg';
                iconClass = 'fa-minus-circle text-red-500';
            } else {
                return; 
            }

            cardHTML = `
                <div class="bankak-card" data-id="${item.id}" data-type="expense">
                    <div class="card-main-content">
                        <div class="details-wrapper">
                            <div class="bank-icon-container ml-3 ${isPayer ? 'icon-success' : 'icon-danger'}">
                                <i class="fas ${iconClass}"></i>
                            </div>
                            <div class="details-text text-right">
                                <p class="transaction-title">${item.title}</p>
                                <p class="transaction-sub"> ${mainTitle} </p>
                            </div>
                        </div>
                        <div class="amount-display ${amountClass}"> ${sign} ${amountDisplay} <span class="text-sm font-normal">SDG</span> </div>
                    </div>
                    <div class="card-footer-date">
                        <span><i class="far fa-calendar-alt ml-1"></i> ${date}</span>
                        <span><i class="far fa-clock ml-1"></i> ${time}</span>
                    </div>
                </div>
            `;
        }

        if (cardHTML) {
            container.innerHTML += cardHTML;
        }
    });

    // 5. تحديث مؤشر العرض وزر "عرض المزيد"
    currentHistoryIndex += itemsToDisplay.length;
    
    if (loadMoreBtn) {
        if (currentHistoryIndex < filteredHistory.length) {
            loadMoreBtn.classList.remove('hidden');
            loadMoreBtn.textContent = `عرض المزيد (${filteredHistory.length - currentHistoryIndex} سجل متبقي)`;
        } else {
            loadMoreBtn.classList.add('hidden');
        }
        // ربط الدالة بالزر
        loadMoreBtn.onclick = () => displayHistory(true);
    }
}

// ============================================================
// 💰 منطق ملخص التسوية (Settlement Summary Logic)
// ============================================================

function calculateNetBalances() {
    // ... (هذه الدالة تستخدم في summary.html وتهدف إلى حساب الأرصدة الصافية مع التسويات)
    if (!currentUserID || allUsers.length === 0) return;

    netBalances = {};
    allUsers.forEach(user => {
        if (user.uid !== currentUserID) {
            netBalances[user.uid] = 0;
        }
    });

    // 1. حساب الأرصدة بناءً على المصروفات (الديون والمستحقات الأولية)
    allExpenses.forEach(expense => {
        const payerId = expense.payer_id;
        const share = expense.share;
        const isMessenger = expense.is_messenger || false;

        // 1.1. أنت الدافع (أنت دائن للآخرين) -> الرصيد موجب
        if (payerId === currentUserID) {
            const participantsToCheck = isMessenger 
                ? expense.participants_ids.filter(id => id !== currentUserID)
                : expense.participants_ids.filter(id => id !== currentUserID);
            
            participantsToCheck.forEach(participantId => {
                if(netBalances[participantId] !== undefined) {
                    // زيادة المستحق لك من هذا الشخص
                    netBalances[participantId] = roundToTwo(netBalances[participantId] + share);
                }
            });
        }
        // 1.2. لست الدافع ولكنك مشارك (أنت مدين للآخرين) -> الرصيد سالب
        else if (expense.participants_ids.includes(currentUserID)) {
            if(netBalances[payerId] !== undefined) {
                // زيادة الدين عليك لهذا الشخص
                netBalances[payerId] = roundToTwo(netBalances[payerId] - share);
            }
        }
    });

    // 2. تطبيق تأثير التسويات على الأرصدة الصافية
    allSettlements.forEach(settlement => {
        const { payer_id, recipient_id, amount } = settlement;
        
        // حالة 1: أنت الدافع (أنت من سدد الدين)
        if (payer_id === currentUserID && netBalances[recipient_id] !== undefined) {
            netBalances[recipient_id] = roundToTwo(netBalances[recipient_id] + amount);
        } 
        
        // حالة 2: أنت المستلم (شخص سدد لك دين عليه)
        else if (recipient_id === currentUserID && netBalances[payer_id] !== undefined) {
            netBalances[payer_id] = roundToTwo(netBalances[payer_id] - amount);
        }
    });
}

function updateSummaryDisplay() {
    // ... (منطق عرض الملخص في summary.html)
}

// ============================================================
// 🔔 منطق الإشعارات (Notifications Logic)
// ============================================================
// ... (دوال loadNotifications, displayNotifications, markNotificationAsRead موجودة بالفعل) ...

// ============================================================
// 🔄 تحميل البيانات (Load Data)
// ============================================================
function loadData() {
    if (!currentUserID || !db) return;

    // جلب المستخدمين
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allUsers = Object.keys(val).map(k => ({uid: k, ...val[k]}));
            currentUserDB = allUsers.find(u => u.uid === currentUserID);
            updateHomeDisplay();
            populateParticipants();
        }
    });

    // جلب المصروفات
    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allExpenses = Object.keys(val).map(key => ({ firebaseId: key, ...val[key] })).sort((a, b) => b.timestamp - a.timestamp);
            
            if (window.location.href.includes('summary.html')) {
                if (allSettlements.length > 0) {
                    calculateNetBalances();
                    updateSummaryDisplay(); 
                }
            }
            if (window.location.href.includes('history.html')) {
                currentHistoryIndex = 0; // ✨ إعادة تعيين المؤشر عند تحديث البيانات
                displayHistory();
            }
            // ... (باقي الصفحات)
        } else {
            allExpenses = [];
        }
    });
    
    // جلب التسويات
    onValue(ref(db, 'settlements'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allSettlements = Object.keys(val).map(key => ({ firebaseId: key, ...val[key] }));
        } else {
            allSettlements = [];
        }
        // تحديث ملخص الأرصدة
        if (window.location.href.includes('summary.html')) {
            calculateNetBalances(); 
            updateSummaryDisplay(); 
        }
         // تحديث صفحة السجل
        if (window.location.href.includes('history.html')) {
            currentHistoryIndex = 0; // ✨ إعادة تعيين المؤشر عند تحديث البيانات
            displayHistory(); 
        }
    });

    // جلب الإشعارات
    // loadNotifications(); // يجب إضافة هذه الدالة في حال عدم وجودها
}

// ============================================================
// 🔐 المصادقة والبداية (Entry Point)
// ============================================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        loadData();
    } else {
        if (!window.location.href.includes('auth.html')) {
            window.location.href = 'auth.html';
        }
    }
});

// ============================================================
// 🔥 دوال التسوية والمطالبة (Final Logic) 🔥
// ============================================================
// ... (دوال nudgeUser, sendSettleTransaction, showSettleModal, hideSettleModal موجودة هنا) ...