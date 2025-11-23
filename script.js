// 🔥 1. تهيئة واستيراد Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, set, push } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// 🛑 إعدادات Firebase (استبدل القيم أدناه ببيانات مشروعك الخاصة)
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

// تهيئة التطبيق
const app = initializeApp(firebaseConfig);
const db = getDatabase(app); 
const auth = getAuth(app); 

// متغيرات عامة
let allUsers = []; 
let expenses = []; 
let currentUserID = null; 
let currentUserDB = null; 

// ----------------------------------------------------------------
// 🛠️ دوال مساعدة (Helper Functions)
// ----------------------------------------------------------------

// دالة لجلب اسم المستخدم بواسطة المعرف
function getUserNameById(uid) {
    const user = allUsers.find(u => u.uid === uid);
    return user ? user.displayName : 'مستخدم غير معروف';
}

// دالة التقريب لرقمين عشريين
function roundToTwo(num) {
    return Math.round(num * 100) / 100;
}

// دالة تنسيق التاريخ والوقت
function formatTimestamp(timestamp) {
    if (!timestamp) return { date: '--', time: '--' };
    const date = new Date(timestamp);
    return {
        date: date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }),
        time: date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    };
}

// ----------------------------------------------------------------
// 🔄 المنطق الرئيسي: جلب البيانات وعرضها
// ----------------------------------------------------------------

function loadDataFromFirebase() {
    if (!currentUserID) return; 

    // 1. جلب المستخدمين وحساب الديون
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const usersObject = snapshot.val();
            allUsers = Object.keys(usersObject).map(uid => ({ uid, ...usersObject[uid] }));
            currentUserDB = allUsers.find(u => u.uid === currentUserID);
            
            // تحديث قوائم الديون
            updateDebtSummary();
        }
    });

    // 2. جلب المصروفات وعرض السجل
    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            const expensesObject = snapshot.val();
            // تحويل الكائن لمصفوفة وترتيبها من الأحدث للأقدم
            expenses = Object.keys(expensesObject)
                .map(key => ({ firebaseId: key, ...expensesObject[key] }))
                .sort((a, b) => b.timestamp - a.timestamp);
        } else {
            expenses = [];
        }
        // عرض السجل
        displayHistory();
    });
}

// تحديث ملخص الديون (المربعات الملونة في الأعلى)
function updateDebtSummary() {
    const debtToYouList = document.getElementById('debtToYouList');
    const debtFromYouList = document.getElementById('debtFromYouList');
    
    if (!debtToYouList || !debtFromYouList) return;

    debtToYouList.innerHTML = '';
    debtFromYouList.innerHTML = '';

    let hasDebtToYou = false;
    let hasDebtFromYou = false;

    allUsers.filter(u => u.uid !== currentUserID).forEach(user => {
        const balance = roundToTwo(user.balance || 0);
        // تنسيق الرقم بفاصلة
        const formattedBal = Math.abs(balance).toLocaleString('en-US');

        if (balance < -0.01) {
            // رصيده سالب = هو مديون لك (أخضر)
            debtToYouList.innerHTML += `<div class="flex justify-between border-b border-green-100 py-1 last:border-0"><span>${user.displayName}</span><span class="font-bold">${formattedBal} ريال</span></div>`;
            hasDebtToYou = true;
        } else if (balance > 0.01) {
            // رصيده موجب = أنت مديون له (أحمر)
            debtFromYouList.innerHTML += `<div class="flex justify-between border-b border-red-100 py-1 last:border-0"><span>${user.displayName}</span><span class="font-bold">${formattedBal} ريال</span></div>`;
            hasDebtFromYou = true;
        }
    });

    if (!hasDebtToYou) debtToYouList.innerHTML = '<span class="text-gray-400 text-xs">لا يوجد ديون لك</span>';
    if (!hasDebtFromYou) debtFromYouList.innerHTML = '<span class="text-gray-400 text-xs">لا يوجد ديون عليك</span>';
}

// ----------------------------------------------------------------
// 🎨 الوظيفة الأهم: عرض السجل بالشكل المطلوب
// ----------------------------------------------------------------
function displayHistory() {
    const container = document.getElementById('expensesContainer');
    if (!container) return;
    
    container.innerHTML = ''; // مسح المحتوى القديم
    
    if (expenses.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-8">لا توجد سجلات بعد.</p>';
        return;
    }

    expenses.forEach(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const isParticipant = expense.participants_ids.includes(currentUserID);

        // 🛑 شرط التصفية: إذا لم تكن دافعاً ولم تكن مشاركاً، لا تظهر العملية
        if (!isPayer && !isParticipant) return;

        // 1. حساب الأرقام
        const totalAmount = expense.amount; // المبلغ الكلي
        const share = expense.share; // حصة الفرد
        let netMovement = 0; // صافي الحركة في رصيدك

        // 2. تحديد النصوص والأسماء
        let title = expense.title;
        let subText = "";
        let detailsText = "";
        
        // 3. تحديد الأنماط (أخضر/أحمر)
        let rowClass = "neutral-style"; // الافتراضي
        let arrowIcon = "fa-minus";

        if (isPayer) {
            // أنت دفعت المبلغ كاملاً
            // صافي الحركة = المبلغ الكلي - حصتك (لأن الباقي دين لك)
            netMovement = totalAmount - share; 
            rowClass = "credit-style"; // أخضر
            arrowIcon = "fa-arrow-down"; // سهم للأسفل (داخل جيبك مستقبلاً)

            subText = `<span class="text-green-700 font-bold">أنت الدافع</span>`;
            detailsText = `دفعت عنهم: ${(totalAmount - share).toLocaleString('en-US')} | حصتك: ${share.toLocaleString('en-US')}`;

        } else if (isParticipant) {
            // شخص آخر دفع وأنت مشارك
            // صافي الحركة = -حصتك (دين عليك)
            netMovement = -share;
            rowClass = "debit-style"; // أحمر
            arrowIcon = "fa-arrow-up"; // سهم للأعلى (خارج من جيبك)

            // إظهار اسم الدافع بوضوح
            const payerName = getUserNameById(expense.payer_id);
            subText = `<span class="text-gray-700 font-semibold">الدافع: ${payerName}</span>`;
            detailsText = `حصتك المطلوبة: ${share.toLocaleString('en-US')}`;
        }

        // تحضير القيم للعرض
        const { date, time } = formatTimestamp(expense.timestamp);
        const formattedTotal = totalAmount.toLocaleString('en-US'); // مثل 5,000
        const formattedNet = Math.abs(netMovement).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        const sign = netMovement > 0 ? '+' : '-';
        
        // أسماء المشاركين (عداك)
        const participantsNames = expense.participants_ids
            .filter(id => id !== currentUserID) // اختياري: إخفاء اسمك من القائمة
            .map(id => getUserNameById(id))
            .join('، ');

        // 4. بناء كود HTML للصف (Row)
        const htmlRow = `
        <div class="transaction-row ${rowClass}">
            
            <div class="transaction-icon">
                <div class="icon-circle">
                    <i class="fas ${arrowIcon} transform ${isPayer ? 'rotate-180' : ''}"></i>
                </div>
            </div>

            <div class="transaction-details">
                <p class="font-bold text-gray-900 text-lg mb-1">${title}</p>
                <div class="text-sm mb-1">
                    ${subText} 
                    <span class="text-gray-400 mx-1">|</span> 
                    <span class="text-gray-600">المبلغ الكلي: <strong>${formattedTotal}</strong> ريال</span>
                </div>
                <p class="text-xs text-gray-500">
                    <i class="fas fa-users ml-1"></i> المشاركون: ${participantsNames || 'الجميع'}
                </p>
            </div>

            <div class="transaction-amount dir-ltr">
                <p class="font-bold text-xl ${isPayer ? 'text-green-600' : 'text-red-600'}" style="direction: ltr;">
                    ${sign}${formattedNet}
                </p>
                <p class="text-xs text-gray-400 mt-1">${date}</p>
                <p class="text-xs text-gray-300">${time}</p>
            </div>

        </div>
        `;

        container.innerHTML += htmlRow;
    });
}

// ----------------------------------------------------------------
// 🔐 إدارة تسجيل الدخول
// ----------------------------------------------------------------
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        loadDataFromFirebase();
    } else {
        window.location.href = 'auth.html';
    }
});
