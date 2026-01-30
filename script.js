// ============================================================
// 🔥 تهيئة واستيراد Firebase SDK
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { 
    getDatabase, 
    ref, 
    onValue, 
    push, 
    update, 
    remove,
    get 
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// 🔥 إعدادات Firebase
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
// 🌐 متغيرات عامة
// ============================================================
let allUsers = [];
let currentUserID = null;
let currentUserDB = null;
let allExpenses = [];
let userNotifications = [];
let allSettlements = [];
let netBalances = {};

// متغيرات التعديل
let editingExpenseId = null;
let originalExpenseData = null;

// متغيرات السجل
let itemsPerPage = 10;
let currentPage = 1;
let activeFilter = 'all';
let filteredHistory = [];
let isLoadingHistory = false;

// متغيرات الإشعارات
let notificationsPerPage = 10;
let currentNotificationPage = 1;
let isLoadingNotifications = false;

// متغيرات التسوية
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
// 🏠 منطق الصفحة الرئيسية (Home Logic)
// ============================================================

function updateHomeDisplay() {
    const balanceEl = document.getElementById('currentBalance');
    const nameEl = document.getElementById('userNamePlaceholder');
    const cardEl = document.getElementById('currentBalanceCard');
    const sidebarName = document.getElementById('sidebarUserName');
    const sidebarEmail = document.getElementById('sidebarUserEmail');

    if (!balanceEl && !nameEl) return;

    let displayName = "مستخدم";
    if (currentUserDB && currentUserDB.displayName) displayName = currentUserDB.displayName;
    else if (auth.currentUser && auth.currentUser.displayName) displayName = auth.currentUser.displayName;

    if (nameEl) nameEl.textContent = displayName;
    if (sidebarName) sidebarName.textContent = displayName;
    if (sidebarEmail && auth.currentUser) sidebarEmail.textContent = auth.currentUser.email || '';

    const balance = (currentUserDB && currentUserDB.balance !== undefined) ? currentUserDB.balance : 0;
    if (balanceEl) {
        balanceEl.textContent = balance.toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 2});
    }

    if (cardEl) {
        if (balance < -0.1) {
            cardEl.classList.add('negative');
        } else {
            cardEl.classList.remove('negative');
        }
    }
}

function populateParticipants() {
    const container = document.getElementById('participantsCheckboxes');
    if (!container) return;
    container.innerHTML = '';

    if (!currentUserID) return;

    allUsers.filter(u => u.uid !== currentUserID).forEach(user => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        div.innerHTML = `
            <label class="flex items-center w-full cursor-pointer">
                <input type="checkbox" data-uid="${user.uid}" class="form-checkbox h-5 w-5 text-blue-600 participant-checkbox">
                <span class="mr-2 font-semibold text-gray-700 select-none">${user.displayName}</span>
            </label>
        `;
        container.appendChild(div);
    });
}

window.selectAllParticipants = function() {
    const checkboxes = document.querySelectorAll('.participant-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
};

// ============================================================
// ✏️ منطق تعديل/حذف المصروف (Edit/Delete Expense) - جديد 🔥
// ============================================================

/**
 * عرض نموذج تعديل المصروف
 */
window.showEditExpenseModal = function(expenseId) {
    const expense = allExpenses.find(e => e.firebaseId === expenseId);
    if (!expense) {
        alert('المصروف غير موجود!');
        return;
    }

    // التحقق من أن المستخدم هو الدافع فقط
    if (expense.payer_id !== currentUserID) {
        alert('لا يمكنك تعديل هذا المصروف لأنك لست الدافع!');
        return;
    }

    editingExpenseId = expenseId;
    originalExpenseData = { ...expense };

    // ملء النموذج بالبيانات الحالية
    document.getElementById('expenseTitle').value = expense.title;
    document.getElementById('expenseAmount').value = expense.total_amount.toLocaleString('en-US');
    document.getElementById('isMessenger').checked = expense.is_messenger || false;

    // تحديد المشاركين
    const checkboxes = document.querySelectorAll('.participant-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = expense.participants_ids.includes(cb.dataset.uid);
    });

    // تغيير نص الزر
    const submitBtn = document.querySelector('#expenseForm button[type="button"]');
    if (submitBtn) {
        submitBtn.textContent = 'تحديث المصروف';
        submitBtn.classList.remove('btn-secondary');
        submitBtn.classList.add('bg-green-600');
        submitBtn.onclick = () => previewExpense(true); // true = edit mode
    }

    // إضافة زر إلغاء التعديل
    let cancelBtn = document.getElementById('cancelEditBtn');
    if (!cancelBtn) {
        cancelBtn = document.createElement('button');
        cancelBtn.id = 'cancelEditBtn';
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn bg-gray-500 text-white mt-3';
        cancelBtn.textContent = 'إلغاء التعديل';
        cancelBtn.onclick = resetEditMode;
        submitBtn.parentNode.insertBefore(cancelBtn, submitBtn.nextSibling);
    }

    // التمرير لأعلى الصفحة
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

/**
 * إعادة تعيين وضع التعديل
 */
function resetEditMode() {
    editingExpenseId = null;
    originalExpenseData = null;
    
    document.getElementById('expenseForm').reset();
    
    const submitBtn = document.querySelector('#expenseForm button[type="button"]');
    if (submitBtn) {
        submitBtn.textContent = 'معاينة وحفظ';
        submitBtn.classList.add('btn-secondary');
        submitBtn.classList.remove('bg-green-600');
        submitBtn.onclick = () => previewExpense(false);
    }

    const cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) cancelBtn.remove();
}

/**
 * حذف مصروف مع إعادة حساب جميع الأرصدة
 */
window.deleteExpense = async function(expenseId) {
    const expense = allExpenses.find(e => e.firebaseId === expenseId);
    if (!expense) {
        alert('المصروف غير موجود!');
        return;
    }

    // التحقق من الصلاحيات
    if (expense.payer_id !== currentUserID) {
        alert('لا يمكنك حذف هذا المصروف لأنك لست الدافع!');
        return;
    }

    if (!confirm('هل أنت متأكد من حذف هذا المصروف؟ سيتم إعادة حساب جميع الأرصدة.')) {
        return;
    }

    try {
        const updates = {};
        const share = expense.share;
        const isMessenger = expense.is_messenger || false;

        // 1. إعادة رصيد الدافع
        const payer = allUsers.find(u => u.uid === expense.payer_id);
        if (payer) {
            let payerRefund;
            if (isMessenger) {
                payerRefund = expense.total_amount;
            } else {
                payerRefund = roundToTwo(expense.total_amount - share);
            }
            const newPayerBalance = roundToTwo(payer.balance - payerRefund);
            updates[`users/${expense.payer_id}/balance`] = newPayerBalance;
        }

        // 2. إعادة أرصدة المشاركين
        const participantsToRefund = expense.participants_ids.filter(id => id !== expense.payer_id);
        participantsToRefund.forEach(uid => {
            const user = allUsers.find(u => u.uid === uid);
            if (user) {
                const newBalance = roundToTwo(user.balance + share);
                updates[`users/${uid}/balance`] = newBalance;
            }
        });

        // 3. حذف المصروف
        updates[`expenses/${expenseId}`] = null;

        // تنفيذ التحديثات
        await update(ref(db), updates);

        alert('تم حذف المصروف وإعادة حساب الأرصدة بنجاح!');
        
        // إعادة تحميل البيانات
        if (window.location.href.includes('my_expenses.html')) {
            displayPersonalExpenses();
        }

    } catch (error) {
        console.error('Error deleting expense:', error);
        alert('حدث خطأ أثناء حذف المصروف: ' + error.message);
    }
};

/**
 * تحديث مصروف موجود مع إعادة حساب الأرصدة
 */
async function updateExpense(newData) {
    if (!editingExpenseId || !originalExpenseData) return;

    try {
        const updates = {};
        const oldExpense = originalExpenseData;
        const oldShare = oldExpense.share;
        const oldIsMessenger = oldExpense.is_messenger || false;
        
        const newShare = newData.share;
        const newIsMessenger = newData.isMessenger;

        // ========== الخطوة 1: التراجع عن التأثيرات القديمة ==========
        
        // إعادة رصيد الدافع القديم
        const oldPayer = allUsers.find(u => u.uid === oldExpense.payer_id);
        if (oldPayer) {
            let oldPayerRefund;
            if (oldIsMessenger) {
                oldPayerRefund = oldExpense.total_amount;
            } else {
                oldPayerRefund = roundToTwo(oldExpense.total_amount - oldShare);
            }
            const tempOldPayerBalance = roundToTwo(oldPayer.balance - oldPayerRefund);
            updates[`users/${oldExpense.payer_id}/balance`] = tempOldPayerBalance;
            oldPayer.balance = tempOldPayerBalance;
        }

        // إعادة أرصدة المشاركين القديمين
        const oldParticipants = oldExpense.participants_ids.filter(id => id !== oldExpense.payer_id);
        oldParticipants.forEach(uid => {
            const user = allUsers.find(u => u.uid === uid);
            if (user) {
                const tempNewBalance = roundToTwo(user.balance + oldShare);
                updates[`users/${uid}/balance`] = tempNewBalance;
                user.balance = tempNewBalance;
            }
        });

        // ========== الخطوة 2: تطبيق التأثيرات الجديدة ==========
        
        // تحديث رصيد الدافع الجديد
        let newPayerContribution;
        if (newIsMessenger) {
            newPayerContribution = newData.amount;
        } else {
            newPayerContribution = roundToTwo(newData.amount - newShare);
        }
        const newPayerBalance = roundToTwo(oldPayer.balance + newPayerContribution);
        updates[`users/${oldExpense.payer_id}/balance`] = newPayerBalance;

        // تحديث أرصدة المشاركين الجدد
        const newParticipants = newData.participants.filter(id => id !== oldExpense.payer_id);
        newParticipants.forEach(uid => {
            const user = allUsers.find(u => u.uid === uid);
            if (user) {
                const finalBalance = roundToTwo(user.balance - newShare);
                updates[`users/${uid}/balance`] = finalBalance;
            }
        });

        // ========== الخطوة 3: تحديث بيانات المصروف ==========
        
        const updatedExpense = {
            title: newData.title,
            total_amount: newData.amount,
            share: newShare,
            payer_id: oldExpense.payer_id,
            participants_ids: newData.participants,
            is_messenger: newIsMessenger,
            timestamp: Date.now(), // تحديث الوقت
            edited: true // علامة أنه تم تعديله
        };

        updates[`expenses/${editingExpenseId}`] = updatedExpense;

        // تنفيذ جميع التحديثات
        await update(ref(db), updates);

        alert('تم تحديث المصروف وإعادة حساب الأرصدة بنجاح!');
        resetEditMode();
        return true;

    } catch (error) {
        console.error('Error updating expense:', error);
        alert('حدث خطأ أثناء تحديث المصروف: ' + error.message);
        return false;
    }
}

// ============================================================
// 💾 منطق حفظ المصروفات (Create/Update)
// ============================================================

function calculateShare(amount, participantsCount) {
    if (participantsCount === 0) return 0;
    return roundToTwo(amount / participantsCount);
}

window.previewExpense = function(isEdit = false) {
    const title = document.getElementById('expenseTitle').value.trim();
    const amountStr = document.getElementById('expenseAmount').value.replace(/,/g, '');
    const amount = parseFloat(amountStr);
    const isMessenger = document.getElementById('isMessenger').checked;
    const checkboxes = document.querySelectorAll('.participant-checkbox:checked');

    let selectedParticipantsUids = Array.from(checkboxes).map(cb => cb.dataset.uid);
    
    // في وضع التعديل، نضيف الدافع إذا لم يكن موجوداً
    if (isEdit && editingExpenseId) {
        if (!selectedParticipantsUids.includes(currentUserID)) {
            selectedParticipantsUids.push(currentUserID);
        }
    } else {
        selectedParticipantsUids.push(currentUserID);
    }
    
    selectedParticipantsUids = [...new Set(selectedParticipantsUids)];

    if (!title || isNaN(amount) || amount <= 0 || selectedParticipantsUids.length < 2) {
        alert("يرجى إدخال اسم المصروف والمبلغ، وتحديد مشارك واحد على الأقل (بالإضافة إليك).");
        return;
    }

    const share = calculateShare(amount, selectedParticipantsUids.length);
    let finalParticipantsUids = selectedParticipantsUids;
    let finalShare = share;

    if (isMessenger) {
        finalParticipantsUids = selectedParticipantsUids.filter(uid => uid !== currentUserID);
        finalShare = calculateShare(amount, finalParticipantsUids.length);

        if (finalParticipantsUids.length === 0) {
            alert("إذا كنت مرسالاً، يجب تحديد مشاركين آخرين غيرك.");
            return;
        }
    }

    const participantsNames = finalParticipantsUids.map(uid => getUserNameById(uid)).join('، ');

    let previewHTML = `
        <p><strong>اسم المصروف:</strong> ${title}</p>
        <p><strong>المبلغ الكلي:</strong> ${amount.toLocaleString('en-US')} SDG</p>
        <p><strong>الدافع:</strong> ${getUserNameById(currentUserID)}</p>
        <p><strong>المشاركون:</strong> ${participantsNames}</p>
        <p><strong>حصة كل شخص:</strong> ${finalShare.toLocaleString('en-US', {minimumFractionDigits: 2})} SDG</p>
        <p class="mt-4 font-bold text-lg ${isMessenger ? 'text-red-600' : 'text-blue-600'}">
            ${isMessenger ? '🔥' : '💰'} حصتك الشخصية ستكون: ${isMessenger ? '0.00' : finalShare.toLocaleString('en-US', {minimumFractionDigits: 2})} SDG
        </p>
    `;

    if (isEdit) {
        previewHTML += `<p class="mt-2 text-orange-600 font-bold"><i class="fas fa-edit"></i> هذا تعديل لمصروف موجود</p>`;
    }

    document.getElementById('previewText').innerHTML = previewHTML;

    window.tempExpenseData = {
        title: title,
        amount: amount,
        share: finalShare,
        participants: finalParticipantsUids,
        isMessenger: isMessenger,
        isEdit: isEdit
    };

    document.getElementById('previewModal').classList.add('show');
    document.getElementById('previewDetails').style.display = 'block';
    document.getElementById('messengerConfirmation').style.display = 'none';
};

window.handleSaveClick = function() {
    if (!window.tempExpenseData) return;

    if (window.tempExpenseData.isEdit) {
        // وضع التعديل
        if (window.tempExpenseData.isMessenger) {
            document.getElementById('previewDetails').style.display = 'none';
            document.getElementById('messengerConfirmation').style.display = 'block';
        } else {
            updateExpense(window.tempExpenseData).then(success => {
                if (success) {
                    window.hideModal();
                    document.getElementById('successModal').classList.add('show');
                    document.getElementById('expenseForm').reset();
                }
            });
        }
    } else {
        // وضع الإنشاء
        if (window.tempExpenseData.isMessenger) {
            document.getElementById('previewDetails').style.display = 'none';
            document.getElementById('messengerConfirmation').style.display = 'block';
        } else {
            window.saveExpense();
        }
    }
};

window.saveExpense = async function() {
    const data = window.tempExpenseData;
    if (!data) return;

    // تعطيل الأزرار
    const confirmBtn = document.getElementById('confirmMessengerButton') || document.getElementById('confirmSaveButton');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'جاري الحفظ...';
    }

    try {
        if (data.isEdit && editingExpenseId) {
            // تعديل موجود
            const success = await updateExpense(data);
            if (success) {
                window.hideModal();
                document.getElementById('successModal').classList.add('show');
                document.getElementById('expenseForm').reset();
            }
        } else {
            // إنشاء جديد
            const expenseRecord = {
                title: data.title,
                total_amount: data.amount,
                share: data.share,
                payer_id: currentUserID,
                participants_ids: data.participants,
                is_messenger: data.isMessenger,
                timestamp: Date.now(),
                edited: false
            };

            const updates = {};

            // تحديث رصيد الدافع
            let payerContribution;
            if (data.isMessenger) {
                payerContribution = data.amount;
            } else {
                payerContribution = roundToTwo(data.amount - data.share);
            }

            const oldBalance = currentUserDB.balance || 0;
            const newBalance = roundToTwo(oldBalance + payerContribution);
            updates[`users/${currentUserID}/balance`] = newBalance;
            currentUserDB.balance = newBalance;

            // تحديث أرصدة المشاركين
            const participantsToDebit = data.participants.filter(uid => uid !== currentUserID);
            participantsToDebit.forEach(uid => {
                const user = allUsers.find(u => u.uid === uid);
                if (user) {
                    const newParticipantBalance = roundToTwo(user.balance - data.share);
                    updates[`users/${uid}/balance`] = newParticipantBalance;
                    user.balance = newParticipantBalance;

                    // إشعار
                    const newNotifKey = push(ref(db, 'notifications')).key;
                    updates[`notifications/${newNotifKey}`] = {
                        uid: uid,
                        message: `دين جديد: ${data.title}. مطلوب منك ${data.share.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG لـ ${getUserNameById(currentUserID)}.`,
                        timestamp: Date.now(),
                        is_read: false,
                        type: 'debit'
                    };
                }
            });

            // إضافة المصروف
            const newExpenseKey = push(ref(db, 'expenses')).key;
            updates[`expenses/${newExpenseKey}`] = expenseRecord;

            await update(ref(db), updates);

            window.hideModal();
            document.getElementById('successModal').classList.add('show');
            document.getElementById('expenseForm').reset();
        }

    } catch (e) {
        console.error("Error:", e);
        alert("حدث خطأ أثناء الحفظ: " + e.message);
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = data.isEdit ? 'تحديث' : (data.isMessenger ? 'موافق (تسجيل كمرسال)' : 'حفظ');
        }
    }
};

// ============================================================
// 📊 منطق مصروفاتي (My Expenses) - مُحدث مع التعديل والحذف
// ============================================================

function displayPersonalExpenses() {
    const container = document.getElementById('personalExpensesContainer');
    const noExpensesEl = document.getElementById('noPersonalExpenses');
    const totalExpensesEl = document.getElementById('totalPersonalExpenses');

    if (!container) return;
    container.innerHTML = '';

    let totalPersonalDebt = 0;

    // فلترة مصروفات المستخدم الحالي (سواء كان دافع أو مشارك)
    const personalList = allExpenses.filter(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const isParticipant = expense.participants_ids.includes(currentUserID);
        return isPayer || isParticipant;
    }).sort((a, b) => b.timestamp - a.timestamp);

    if (personalList.length === 0) {
        if(noExpensesEl) noExpensesEl.classList.remove('hidden');
        if(totalExpensesEl) totalExpensesEl.textContent = '0.00';
        return;
    }

    if(noExpensesEl) noExpensesEl.classList.add('hidden');

    personalList.forEach(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const isMessenger = expense.is_messenger || false;
        const share = expense.share || 0;
        const { date, time } = formatBankDate(expense.timestamp);

        let displayAmount = 0;
        let mainTitle, subTitle, iconClass, amountClass, iconBadge;

        // تخطي المصاريف التي لا تؤثر (المرسال بحصة 0)
        if (isPayer && isMessenger && share < 0.1 && expense.total_amount < 0.1) return;

        if (isPayer && !isMessenger) {
            displayAmount = share;
            mainTitle = `حصتك في: ${expense.title}`;
            subTitle = `دفعت ${expense.total_amount.toLocaleString()} SDG`;
            iconClass = 'icon-success';
            amountClass = 'amount-pos';
            iconBadge = 'fa-arrow-up text-green-500';
            totalPersonalDebt += displayAmount;
        } else if (isPayer && isMessenger) {
            displayAmount = 0;
            mainTitle = `دفعت كمرسال: ${expense.title}`;
            subTitle = `المبلغ: ${expense.total_amount.toLocaleString()} SDG`;
            iconClass = 'icon-success';
            amountClass = 'amount-pos';
            iconBadge = 'fa-hand-holding-usd text-purple-500';
        } else {
            // مشارك فقط
            displayAmount = share;
            const payerName = getUserNameById(expense.payer_id);
            mainTitle = `دين لـ ${payerName}`;
            subTitle = `في: ${expense.title}`;
            iconClass = 'icon-danger';
            amountClass = 'amount-neg';
            iconBadge = 'fa-arrow-down text-red-500';
            totalPersonalDebt += displayAmount;
        }

        if (displayAmount < 0.1 && !isMessenger) return;

        const amountDisplay = displayAmount.toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 2});
        
        // أزرار التعديل والحذف (فقط للدافع)
        let actionButtons = '';
        if (isPayer) {
            actionButtons = `
                <div class="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    <button onclick="showEditExpenseModal('${expense.firebaseId}')" class="flex-1 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-200 transition">
                        <i class="fas fa-edit ml-1"></i> تعديل
                    </button>
                    <button onclick="deleteExpense('${expense.firebaseId}')" class="flex-1 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-200 transition">
                        <i class="fas fa-trash ml-1"></i> حذف
                    </button>
                </div>
            `;
        }

        const cardHTML = `
            <div class="bankak-card mb-4 bg-white rounded-xl shadow-md overflow-hidden">
                <div class="card-main-content p-4">
                    <div class="details-wrapper flex items-center">
                        <div class="bank-icon-container ${iconClass} ml-3 w-12 h-12 rounded-full flex items-center justify-center text-xl">
                            <i class="fas fa-file-invoice-dollar"></i>
                            <span class="arrow-badge absolute -bottom-1 -right-1 bg-white rounded-full p-1 text-xs shadow">
                                <i class="fas ${iconBadge}"></i>
                            </span>
                        </div>
                        <div class="details-text text-right flex-1">
                            <p class="transaction-title font-bold text-gray-800">${mainTitle}</p>
                            <p class="transaction-sub text-sm text-gray-500">${subTitle}</p>
                            ${expense.edited ? '<span class="text-xs text-orange-500"><i class="fas fa-edit"></i> تم التعديل</span>' : ''}
                        </div>
                        <div class="amount-display ${amountClass} text-lg font-bold">
                            ${isMessenger ? 'مرسال' : (amountDisplay + ' SDG')}
                        </div>
                    </div>
                    <div class="card-footer-date mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-400">
                        <span><i class="far fa-calendar-alt ml-1"></i> ${date}</span>
                        <span><i class="far fa-clock ml-1"></i> ${time}</span>
                    </div>
                </div>
                ${actionButtons}
            </div>
        `;
        container.innerHTML += cardHTML;
    });

    if (totalExpensesEl) {
        totalExpensesEl.textContent = totalPersonalDebt.toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 2});
    }
}

// ============================================================
// 💰 منطق ملخص التسوية (Settlement Summary)
// ============================================================

function calculateNetBalances() {
    if (!currentUserID || allUsers.length === 0) return;

    netBalances = {};
    allUsers.forEach(user => {
        if (user.uid !== currentUserID) {
            netBalances[user.uid] = 0;
        }
    });

    // حساب من المصروفات
    allExpenses.forEach(expense => {
        const payerId = expense.payer_id;
        const share = expense.share;
        const isMessenger = expense.is_messenger || false;

        if (payerId === currentUserID) {
            const participantsToCheck = isMessenger 
                ? expense.participants_ids.filter(id => id !== currentUserID)
                : expense.participants_ids.filter(id => id !== currentUserID);

            participantsToCheck.forEach(participantId => {
                if(netBalances[participantId] !== undefined) {
                    netBalances[participantId] = roundToTwo(netBalances[participantId] + share);
                }
            });
        } else if (expense.participants_ids.includes(currentUserID)) {
            if(netBalances[payerId] !== undefined) {
                netBalances[payerId] = roundToTwo(netBalances[payerId] - share);
            }
        }
    });

    // تطبيق التسويات
    allSettlements.forEach(settlement => {
        const { payer_id, recipient_id, amount } = settlement;

        if (payer_id === currentUserID && netBalances[recipient_id] !== undefined) {
            netBalances[recipient_id] = roundToTwo(netBalances[recipient_id] + amount);
        } else if (recipient_id === currentUserID && netBalances[payer_id] !== undefined) {
            netBalances[payer_id] = roundToTwo(netBalances[payer_id] - amount);
        }
    });
}

function updateSummaryDisplay() {
    const totalDebtEl = document.getElementById('totalDebt');
    const totalCreditEl = document.getElementById('totalCredit');
    const debtContainer = document.getElementById('debtContainer');
    const claimList = document.getElementById('claimList');
    const noDebtsEl = document.getElementById('noDebts');

    if (!totalDebtEl || !totalCreditEl) return;

    let totalDebt = 0;
    let totalCredit = 0;
    let hasDebtItems = false;
    let hasClaimItems = false;

    if (debtContainer) debtContainer.innerHTML = '';
    if (claimList) claimList.innerHTML = '';

    Object.keys(netBalances).forEach(otherUID => {
        const netAmount = netBalances[otherUID];
        const otherUserName = getUserNameById(otherUID);

        if (Math.abs(netAmount) < 0.1) return;

        if (netAmount < 0) {
            // أنت مدين
            const amount = Math.abs(netAmount);
            totalDebt += amount;
            hasDebtItems = true;

            if (debtContainer) {
                const debtHTML = `
                    <div class="balance-card" data-user-id="${otherUID}" data-amount="${amount}">
                        <div class="balance-info">
                            <span class="balance-name">${otherUserName}</span>
                            <span class="balance-amount text-red-600">${amount.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG</span>
                        </div>
                        <button class="action-button" onclick="showSettleModal('${otherUserName}', ${amount}, '${otherUID}')">
                            تسوية
                        </button>
                    </div>
                `;
                debtContainer.innerHTML += debtHTML;
            }

        } else if (netAmount > 0) {
            // أنت دائن
            const amount = netAmount;
            totalCredit += amount;
            hasClaimItems = true;

            if (claimList) {
                const claimHTML = `
                    <div class="claim-item flex justify-between items-center py-2 border-b border-gray-100">
                        <span class="font-semibold">${otherUserName}</span>
                        <div class="flex items-center gap-3">
                            <span class="text-green-600 font-bold">${amount.toLocaleString(undefined, {minimumFractionDigits: 2})} SDG</span>
                            <button class="nudge-button-individual px-3 py-1 bg-yellow-400 text-yellow-900 rounded text-sm" 
                                    onclick="nudgeUser('${otherUserName}', '${otherUID}')">
                                نكز
                            </button>
                        </div>
                    </div>
                `;
                claimList.innerHTML += claimHTML;
            }
        }
    });

    totalDebtEl.innerHTML = `${roundToTwo(totalDebt).toLocaleString(undefined, {minimumFractionDigits: 2})} <span class="text-base font-normal">SDG</span>`;
    totalCreditEl.innerHTML = `${roundToTwo(totalCredit).toLocaleString(undefined, {minimumFractionDigits: 2})} <span class="text-base font-normal">SDG</span>`;

    if (noDebtsEl) {
        if (!hasDebtItems) {
            noDebtsEl.classList.remove('hidden');
            if (debtContainer) debtContainer.innerHTML = '';
        } else {
            noDebtsEl.classList.add('hidden');
        }
    }

    if (claimList && !hasClaimItems) {
        claimList.innerHTML = '<p class="text-center text-gray-500 py-4">لا توجد مستحقات</p>';
    }
}

// ============================================================
// 📜 منطق السجل (History)
// ============================================================

function combineAndSortHistory() {
    const combined = [];

    allExpenses.forEach(expense => {
        const isPayer = expense.payer_id === currentUserID;
        const isParticipant = expense.participants_ids.includes(currentUserID);

        if (isPayer || isParticipant) {
            combined.push({
                type: 'expense',
                ...expense,
                timestamp: expense.timestamp
            });
        }
    });

    allSettlements.forEach(settlement => {
        if (settlement.payer_id === currentUserID || settlement.recipient_id === currentUserID) {
            combined.push({
                type: 'settlement',
                ...settlement,
                timestamp: settlement.timestamp
            });
        }
    });

    return combined.sort((a, b) => b.timestamp - a.timestamp);
}

function filterHistory(filterType) {
    const allHistory = combineAndSortHistory();
    const now = Date.now();

    filteredHistory = allHistory.filter(record => {
        if (filterType === '30days') {
            return record.timestamp >= now - (30 * 24 * 60 * 60 * 1000);
        } else if (filterType === '3months') {
            return record.timestamp >= now - (90 * 24 * 60 * 60 * 1000);
        } else if (filterType === 'incoming') {
            if (record.type === 'settlement' && record.recipient_id === currentUserID) return true;
            if (record.type === 'expense' && record.payer_id === currentUserID) return true;
            return false;
        } else if (filterType === 'outgoing') {
            if (record.type === 'settlement' && record.payer_id === currentUserID) return true;
            if (record.type === 'expense' && record.participants_ids.includes(currentUserID) && record.payer_id !== currentUserID) return true;
            return false;
        }
        return true;
    });
}

function displayHistory(isAppending = false) {
    const container = document.getElementById('expensesContainer');
    if (!container || isLoadingHistory) return;

    isLoadingHistory = true;

    if (!isAppending) {
        container.innerHTML = '';
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = currentPage * itemsPerPage;
    const recordsToShow = filteredHistory.slice(startIndex, endIndex);

    if (recordsToShow.length === 0 && currentPage === 1) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-500">
                <i class="fas fa-inbox fa-3x mb-4"></i>
                <p>لا توجد سجلات</p>
            </div>
        `;
        isLoadingHistory = false;
        return;
    }

    recordsToShow.forEach(record => {
        const { date, time } = formatBankDate(record.timestamp);
        let cardHTML = '';

        if (record.type === 'expense') {
            const isPayer = record.payer_id === currentUserID;
            const payerName = getUserNameById(record.payer_id);
            const share = record.share || 0;
            
            let iconClass = 'bg-red-100 text-red-600';
            let amountText = '';
            let title = record.title;

            if (isPayer) {
                if (record.is_messenger) {
                    iconClass = 'bg-purple-100 text-purple-600';
                    amountText = `+${record.total_amount.toLocaleString()}`;
                    title += ' (مرسال)';
                } else {
                    iconClass = 'bg-green-100 text-green-600';
                    amountText = `+${(record.total_amount - share).toLocaleString()}`;
                }
            } else {
                amountText = `-${share.toLocaleString()}`;
            }

            cardHTML = `
                <div class="history-item flex items-center justify-between p-4 bg-white rounded-xl shadow-sm mb-3">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-full ${iconClass} flex items-center justify-center">
                            <i class="fas fa-receipt"></i>
                        </div>
                        <div>
                            <p class="font-bold text-gray-800">${title}</p>
                            <p class="text-sm text-gray-500">${payerName} • ${date}</p>
                        </div>
                    </div>
                    <span class="font-bold ${isPayer ? 'text-green-600' : 'text-red-600'}">${amountText} SDG</span>
                </div>
            `;
        } else {
            const isPayer = record.payer_id === currentUserID;
            const otherName = isPayer ? getUserNameById(record.recipient_id) : getUserNameById(record.payer_id);
            
            cardHTML = `
                <div class="history-item flex items-center justify-between p-4 bg-white rounded-xl shadow-sm mb-3">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                            <i class="fas fa-handshake"></i>
                        </div>
                        <div>
                            <p class="font-bold text-gray-800">${isPayer ? 'تسوية دفعتها' : 'تسوية تلقيتها'}</p>
                            <p class="text-sm text-gray-500">${otherName} • ${date}</p>
                        </div>
                    </div>
                    <span class="font-bold ${isPayer ? 'text-red-600' : 'text-green-600'}">
                        ${isPayer ? '-' : '+'}${record.amount.toLocaleString()} SDG
                    </span>
                </div>
            `;
        }

        container.innerHTML += cardHTML;
    });

    isLoadingHistory = false;
}

window.setFilter = function(filterType, element) {
    document.querySelectorAll('.filter-btn, .filter-pill').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    activeFilter = filterType;
    currentPage = 1;
    filterHistory(filterType);
    displayHistory();
};

// ============================================================
// 🔔 منطق الإشعارات (Notifications)
// ============================================================

function loadNotifications() {
    if (!currentUserID) return;

    onValue(ref(db, 'notifications'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            userNotifications = Object.keys(val)
                .map(key => ({ id: key, ...val[key] }))
                .filter(n => n.uid === currentUserID)
                .sort((a, b) => b.timestamp - a.timestamp);
            
            currentNotificationPage = 1;
            displayNotifications();
        } else {
            userNotifications = [];
            displayNotifications();
        }
    });
}

function displayNotifications(isAppending = false) {
    const listContainer = document.getElementById('notificationsList');
    const badge = document.getElementById('notificationBadge');

    if (!listContainer || !badge) return;

    if (!isAppending) {
        listContainer.innerHTML = '';
    }

    const unreadCount = userNotifications.filter(n => !n.is_read).length;
    badge.textContent = unreadCount.toString();
    badge.classList.toggle('hidden', unreadCount === 0);

    const startIndex = (currentNotificationPage - 1) * notificationsPerPage;
    const endIndex = currentNotificationPage * notificationsPerPage;
    const notificationsToShow = userNotifications.slice(startIndex, endIndex);

    if (notificationsToShow.length === 0 && currentPage === 1) {
        listContainer.innerHTML = '<p class="text-center text-gray-500 py-4">لا توجد إشعارات</p>';
        return;
    }

    notificationsToShow.forEach(notification => {
        const notifHTML = `
            <div class="p-3 rounded-lg ${notification.is_read ? 'bg-gray-50' : 'bg-blue-50'} border cursor-pointer mb-2"
                 onclick="markNotificationAsRead('${notification.id}')">
                <p class="text-sm ${notification.is_read ? 'text-gray-600' : 'font-semibold text-gray-800'}">
                    ${notification.message}
                </p>
                <p class="text-xs text-gray-400 mt-1">${formatBankDate(notification.timestamp).date}</p>
            </div>
        `;
        listContainer.innerHTML += notifHTML;
    });
}

window.markNotificationAsRead = async function(notificationId) {
    if (!db) return;
    try {
        await update(ref(db, `notifications/${notificationId}`), { is_read: true });
    } catch (e) {
        console.error("Error marking notification as read:", e);
    }
};

window.nudgeUser = async function(userName, userId) {
    if (!confirm(`هل تريد إرسال تذكير لـ ${userName} بالدفع؟`)) return;

    try {
        const newNotifKey = push(ref(db, 'notifications')).key;
        await update(ref(db), {
            [`notifications/${newNotifKey}`]: {
                uid: userId,
                message: `${getUserNameById(currentUserID)} يرسل لك تذكيراً بالدفع!`,
                timestamp: Date.now(),
                is_read: false,
                type: 'nudge'
            }
        });
        alert('تم إرسال التذكير!');
    } catch (e) {
        alert('حدث خطأ: ' + e.message);
    }
};

window.sendClaimNotification = async function() {
    const claimList = document.getElementById('claimList');
    if (!claimList || claimList.children.length === 0) {
        alert('لا يوجد مستحقات للمطالبة بها!');
        return;
    }

    if (!confirm('هل تريد إرسال مطالبة عامة لجميع المدينين؟')) return;

    try {
        const updates = {};
        Object.keys(netBalances).forEach(uid => {
            if (netBalances[uid] > 0) {
                const newNotifKey = push(ref(db, 'notifications')).key;
                updates[`notifications/${newNotifKey}`] = {
                    uid: uid,
                    message: `مطالبة عامة: ${getUserNameById(currentUserID)} يطالبك بدفع ${netBalances[uid].toLocaleString()} SDG`,
                    timestamp: Date.now(),
                    is_read: false,
                    type: 'claim'
                };
            }
        });

        await update(ref(db), updates);
        alert('تم إرسال المطالبة العامة!');
        hideClaimModal();
    } catch (e) {
        alert('حدث خطأ: ' + e.message);
    }
};

// ============================================================
// 💰 منطق التسوية (Settlement)
// ============================================================

window.showSettleModal = function(userName, amount, uid) {
    currentSettleUser = userName;
    currentSettleMaxAmount = amount;
    currentSettleRecipientUID = uid;

    const modal = document.getElementById('settleModal');
    const relationEl = document.getElementById('settleRelation');
    const maxAmountEl = document.getElementById('maxSettleAmountDisplay');
    const amountInput = document.getElementById('settle amountInput = document amountInput = document.getElementById('settleAmount');

    if (relationEl) relationEl.textContent = `تسوية الدين لـ ${userName}`;
    if (maxAmountEl) maxAmountEl.textContent = amount.toLocaleString(undefined, {minimumFractionDigits: 2});
    if (amountInput) {
        amountInput.value = amount;
        amountInput.max = amount;
    }

    if (modal) modal.classList.add('show');
};

window.hideSettleModal = function() {
    const modal = document.getElementById('settleModal');
    const form = document.getElementById('settleForm');
    
    if (modal) modal.classList.remove('show');
    if (form) form.reset();

    currentSettleUser = '';
    currentSettleMaxAmount = 0;
    currentSettleRecipientUID = '';
};

window.sendSettleTransaction = async function(recipientUID, amount, opNumber) {
    if (!currentUserID || !recipientUID || amount <= 0) return false;

    try {
        const updates = {};
        const payerName = getUserNameById(currentUserID);
        const payer = allUsers.find(u => u.uid === currentUserID);
        const recipient = allUsers.find(u => u.uid === recipientUID);

        if (!payer || !recipient) return false;

        // تحديث الأرصدة
        updates[`users/${currentUserID}/balance`] = roundToTwo(payer.balance + amount);
        updates[`users/${recipientUID}/balance`] = roundToTwo(recipient.balance - amount);

        // إضافة سجل التسوية
        const newSettleKey = push(ref(db, 'settlements')).key;
        updates[`settlements/${newSettleKey}`] = {
            payer_id: currentUserID,
            recipient_id: recipientUID,
            amount: amount,
            operation_number: opNumber,
            timestamp: Date.now()
        };

        // إشعار
        const newNotifKey = push(ref(db, 'notifications')).key;
        updates[`notifications/${newNotifKey}`] = {
            uid: recipientUID,
            message: `${payerName} سدد لك ${amount.toLocaleString()} SDG`,
            timestamp: Date.now(),
            is_read: false,
            type: 'settlement_received'
        };

        await update(ref(db), updates);
        return true;

    } catch (e) {
        console.error("Settlement error:", e);
        return false;
    }
};

// ============================================================
// 🎛️ التحكم في المودالات (Modal Controls)
// ============================================================

window.hideModal = function() {
    const modal = document.getElementById('previewModal');
    if (modal) modal.classList.remove('show');
};

window.hideSuccessModal = function() {
    const modal = document.getElementById('successModal');
    if (modal) modal.classList.remove('show');
};

window.showNotifications = function() {
    const modal = document.getElementById('notificationModal');
    if (modal) {
        currentNotificationPage = 1;
        displayNotifications();
        modal.classList.add('show');
    }
};

window.hideNotificationModal = function() {
    const modal = document.getElementById('notificationModal');
    if (modal) modal.classList.remove('show');
};

window.hideClaimModal = function() {
    const modal = document.getElementById('claimModal');
    if (modal) modal.classList.remove('show');
};

window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('open');
        document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : 'auto';
    }
};

window.closeSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.remove('open');
        document.body.style.overflow = 'auto';
    }
};

// ============================================================
// 🔄 تحميل البيانات والبدء (Initialization)
// ============================================================

function loadData() {
    if (!currentUserID) return;

    // المستخدمين
    onValue(ref(db, 'users'), (snapshot) => {
        if (snapshot.exists()) {
            const val = snapshot.val();
            allUsers = Object.keys(val).map(k => ({uid: k, ...val[k]}));
            currentUserDB = allUsers.find(u => u.uid === currentUserID);
            
            updateHomeDisplay();
            populateParticipants();
            
            if (window.location.href.includes('summary.html')) {
                calculateNetBalances();
                updateSummaryDisplay();
            }
        }
    });

    // المصروفات
    onValue(ref(db, 'expenses'), (snapshot) => {
        if (snapshot.exists()) {
            allExpenses = Object.keys(val).map(key => ({ 
                firebaseId: key, 
                ...val[key] 
            })).sort((a, b) => b.timestamp - a.timestamp);
        } else {
            allExpenses = [];
        }

        if (window.location.href.includes('my_expenses.html')) {
            displayPersonalExpenses();
        }
        if (window.location.href.includes('summary.html')) {
            calculateNetBalances();
            updateSummaryDisplay();
        }
        if (window.location.href.includes('history.html')) {
            filterHistory(activeFilter);
            displayHistory();
        }
    });

    // التسويات
    onValue(ref(db, 'settlements'), (snapshot) => {
        if (snapshot.exists()) {
            allSettlements = Object.keys(snapshot.val()).map(key => ({
                firebaseId: key,
                ...snapshot.val()[key]
            }));
        } else {
            allSettlements = [];
        }

        if (window.location.href.includes('summary.html')) {
            calculateNetBalances();
            updateSummaryDisplay();
        }
        if (window.location.href.includes('history.html')) {
            filterHistory(activeFilter);
            displayHistory();
        }
    });

    loadNotifications();
}

// ============================================================
// 🔐 المصادقة (Authentication)
// ============================================================

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserID = user.uid;
        loadData();

        // ربط أحداث التسجيل الخروج
        const logoutBtns = document.querySelectorAll('#logoutBtn, #logoutSidebarButton, #logoutBtnMain');
        logoutBtns.forEach(btn => {
            if (btn) {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    signOut(auth).then(() => {
                        window.location.href = 'auth.html';
                    });
                });
            }
        });

    } else {
        if (!window.location.href.includes('auth.html')) {
            window.location.href = 'auth.html';
        }
    }
});

// ============================================================
// 📋 أحداث DOM (DOM Events)
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    // زر القائمة
    const menuBtn = document.getElementById('menuButton');
    if (menuBtn) menuBtn.addEventListener('click', toggleSidebar);

    // نموذج التسوية
    const settleForm = document.getElementById('settleForm');
    if (settleForm) {
        settleForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const opNum = document.getElementById('operationNumber').value;
            const amount = parseFloat(document.getElementById('settleAmount').value);

            if (opNum.length < 4) {
                alert('يرجى إدخال رقم عملية صحيح (4 أرقام على الأقل)');
                return;
            }

            if (amount <= 0 || amount > currentSettleMaxAmount) {
                alert('المبلغ غير صحيح');
                return;
            }

            const success = await sendSettleTransaction(
                currentSettleRecipientUID, 
                amount, 
                opNum.slice(-4)
            );

            if (success) {
                alert('تمت التسوية بنجاح!');
                hideSettleModal();
            } else {
                alert('فشلت التسوية، حاول مرة أخرى');
            }
        });
    }

    // تحديث الرصيد المتبقي في التسوية
    const settleAmountInput = document.getElementById('settleAmount');
    if (settleAmountInput) {
        settleAmountInput.addEventListener('input', function() {
            const paid = parseFloat(this.value) || 0;
            const max = parseFloat(this.getAttribute('max')) || 0;
            const remaining = max - paid;
            
            const remainingDisplay = document.getElementById('remainingBalance');
            const remainingValue = document.getElementById('remainingValue');

            if (remainingDisplay && remainingValue) {
                if (paid > 0) {
                    remainingDisplay.classList.remove('hidden');
                    remainingValue.textContent = remaining.toLocaleString(undefined, {minimumFractionDigits: 2}) + ' SDG';
                    remainingDisplay.style.backgroundColor = remaining > 0 ? '#FEF3C7' : '#D1FAE5';
                    remainingDisplay.style.color = remaining > 0 ? '#B45309' : '#059669';
                } else {
                    remainingDisplay.classList.add('hidden');
                }
            }
        });
    }

    // إغلاق المودالات بالنقر خارجها
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    });
});
