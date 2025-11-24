// 🔥 تهيئة واستيراد Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, set, push, update } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
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

let allUsers = []; 
let currentUserID = null; 
let currentUserDB = null; 
let expenses = [];

// ------------------------------------------------
// 🛠️ 1. دوال تحديث الشاشة (الرصيد والاسم)
// ------------------------------------------------

// ✅ دالة التحديث الرئيسية - تم إصلاحها لتظهر الاسم واللون فوراً
function updateBalanceDisplay() {
    const nameEl = document.getElementById('userNamePlaceholder');
    const balanceEl = document.getElementById('currentBalance');
    const cardEl = document.getElementById('currentBalanceCard');

    // 1. تحديث الاسم
    // نحاول أخذ الاسم من قاعدة البيانات، إذا لم يوجد نأخذه من تسجيل الدخول
    let displayName = "مستخدم";
    if (currentUserDB && currentUserDB.displayName) {
        displayName = currentUserDB.displayName;
    } else if (auth.currentUser && auth.currentUser.displayName) {
        displayName = auth.currentUser.displayName;
    }
    
    if (nameEl) nameEl.textContent = displayName;

    // 2. تحديث الرصيد واللون
    if (balanceEl && cardEl) {
        // إذا لم تكن البيانات جاهزة نعتبر الرصيد 0
        const balance = (currentUserDB && currentUserDB.balance) ? currentUserDB.balance : 0;
        
        // عرض الرقم مع الفاصلة
        balanceEl.textContent = balance.toLocaleString('en-US', {minimumFractionDigits: 1});

        // 🛑 منطق الألوان: سالب = أحمر، موجب = أخضر
        if (balance < -0.1) { // نستخدم -0.1 لتجنب الصفر السالب
            cardEl.classList.add('negative'); // تفعيل اللون الأحمر
        } else {
            cardEl.classList.remove('negative'); // العودة للأخضر
        }
    }
}

// تنسيق الأرقام بفاصلة في حقل الإدخال
window.formatNumber = function(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== '') {
        input.value = parseFloat(value).toLocaleString('en-US'); 
    }
};

// تقريب الأرقام
function roundToTwo(num) {
    return Math.round(num * 100) / 100;
}

// ملء قائمة المشاركين
function populateParticipants() {
    const container = document.getElementById('participantsCheckboxes');
    if (!container) return;
    container.innerHTML = '';

    allUsers.filter(u => u.uid !== currentUserID).forEach(user => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        div.innerHTML = `
            <label class="flex items-center w-full cursor-pointer p-2">
                <input type="checkbox" data-uid="${user.uid}" class="form-checkbox h-5 w-5 text-blue-600">
                <span class="mr-2 font-semibold text-gray-700 select-none">${user.displayName}</span>
            </label>
        `;
        container.appendChild(div);
    });
}

window.selectAllParticipants = function() {
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);
};

// ------------------------------------------------
// 🔄 2. جلب البيانات من Firebase
// ------------------------------------------------

function loadData() {
    if (!currentUserID) return;

    // جلب بيانات المستخدمين والرصيد
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allUsers = Object.keys(val).map(k => ({uid: k, ...val[k]}));
            
            // العثور على المستخدم الحالي
            currentUserDB = allUsers.find(u => u.uid === currentUserID);
            
            // ✅ تحديث الشاشة فور وصول البيانات
            updateBalanceDisplay(); 
            populateParticipants();
        }
    });

    // جلب المصروفات (فقط للتحقق من التكرار لاحقاً)
    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            expenses = Object.values(snapshot.val());
        }
    });
}

// ------------------------------------------------
// 💾 3. عمليات الحفظ (نفس المنطق السليم)
// ------------------------------------------------

window.previewExpense = function() {
    const title = document.getElementById('expenseTitle').value;
    const amountStr = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(amountStr);

    if (!title || isNaN(amount) || amount <= 0) {
        alert('يرجى إدخال البيانات بشكل صحيح (الاسم والمبلغ)');
        return;
    }

    const checkboxes = document.querySelectorAll('#participantsCheckboxes input:checked');
    const participants = Array.from(checkboxes).map(cb => cb.getAttribute('data-uid'));
    
    if (!participants.includes(currentUserID)) participants.push(currentUserID);

    const count = participants.length;
    const share = amount / count;

    const text = `
        <ul class="list-disc pr-4 space-y-2 text-right" dir="rtl">
            <li><b>المصروف:</b> ${title}</li>
            <li><b>المبلغ الكلي:</b> ${amount.toLocaleString()} SDG</li>
            <li><b>عدد المشاركين:</b> ${count}</li>
            <li><b>نصيب الفرد:</b> ${share.toLocaleString(undefined, {maximumFractionDigits: 1})} SDG</li>
        </ul>
    `;
    document.getElementById('previewText').innerHTML = text;

    const today = new Date().toISOString().split('T')[0];
    const isDuplicate = expenses.some(e => e.date === today && e.title === title && e.amount === amount);
    document.getElementById('warning').style.display = isDuplicate ? 'block' : 'none';

    document.getElementById('previewModal').classList.add('show');
};

window.saveExpense = async function() {
    window.hideModal();
    
    const title = document.getElementById('expenseTitle').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value.replace(/,/g, ''));
    
    const checkboxes = document.querySelectorAll('#participantsCheckboxes input:checked');
    let participantsIDs = Array.from(checkboxes).map(cb => cb.getAttribute('data-uid'));
    if (!participantsIDs.includes(currentUserID)) participantsIDs.push(currentUserID);

    const share = roundToTwo(amount / participantsIDs.length);
    const updates = {};

    // تحديث أرصدة الجميع
    allUsers.forEach(user => {
        let bal = user.balance || 0;
        
        if (user.uid === currentUserID) {
            bal += (amount - share); // أنت دفعت (يضاف لك) وتخصم حصتك
        } else if (participantsIDs.includes(user.uid)) {
            bal -= share; // هو شارك ولم يدفع (يخصم منه)
        }
        
        // تجهيز التحديث
        updates[`users/${user.uid}/balance`] = roundToTwo(bal);
    });

    // تجهيز المصروف
    const newExpenseKey = push(ref(db, 'expenses')).key;
    updates[`expenses/${newExpenseKey}`] = {
        title, 
        amount, 
        share,
        payer_id: currentUserID,
        participants_ids: participantsIDs,
        timestamp: Date.now(),
        date: new Date().toISOString().split('T')[0]
    };

    try {
        // ✅ إرسال كل التحديثات دفعة واحدة لضمان السرعة والدقة
        await update(ref(db), updates);
        
        document.getElementById('successModal').classList.add('show');
        document.getElementById('expenseForm').reset();
        document.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = false);

    } catch (e) {
        console.error(e);
        alert('حدث خطأ أثناء الاتصال بقاعدة البيانات');
    }
};

// ------------------------------------------------
// 🔐 4. مراقب تسجيل الدخول (نقطة البداية)
// ------------------------------------------------
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        
        // ✅ عرض اسم المستخدم فوراً من بيانات الدخول (أسرع من القاعدة)
        if (document.getElementById('userNamePlaceholder')) {
            document.getElementById('userNamePlaceholder').textContent = user.displayName || 'مستخدم';
        }

        // ثم تحميل بقية البيانات
        loadData();
        
        const logoutBtn = document.getElementById('logoutButton');
        if(logoutBtn) {
            logoutBtn.onclick = () => {
                auth.signOut().then(() => window.location.href = 'auth.html');
            };
        }
    } else {
        window.location.href = 'auth.html';
    }
});

// دوال إغلاق النوافذ
window.hideModal = () => document.getElementById('previewModal').classList.remove('show');
window.hideSuccessModal = () => document.getElementById('successModal').classList.remove('show');
