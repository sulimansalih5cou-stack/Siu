// ... (بقية الرمز في الأعلى) ...

// 💡 دالة الحفظ الرئيسية
async function saveExpense() {
    // ⚠️ يتم استدعاء saveExpense بعد المعاينة، لذا يجب إخفاء الـ modal أولاً
    if (document.getElementById('previewModal')) {
         hideModal();
    }

    // ... (بقية منطق الدالة) ...

    try {
        await set(ref(db, 'users'), usersUpdate);
        await push(ref(db, 'expenses'), newExpense);

        if (document.getElementById('expenseForm')) {
             // 🛑 التعديل: استبدال الإشعار العائم بـ Modal النجاح
             showSuccessModal(); 
             
             document.getElementById('expenseForm').reset();
             document.querySelectorAll('#participantsCheckboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
        }

    } catch (error) {
        // ... (بقية منطق التعامل مع الخطأ) ...
    }
}

// ... (بقية الرمز) ...

// *إتاحة الدوال للـ HTML*
window.formatNumber = formatNumber;
window.selectAllParticipants = selectAllParticipants;
window.previewExpense = previewExpense;
window.saveExpense = saveExpense;

// الدوال المتعلقة بالـ Modal
window.hideModal = () => document.getElementById('previewModal').classList.remove('show');
// 🛑 تأكد من أن هذه الدوال متاحة للـ HTML وتعمل على Modal رسالة النجاح
window.showSuccessModal = () => document.getElementById('successModal').classList.add('show');
window.hideSuccessModal = () => { 
    document.getElementById('successModal').classList.remove('show');
    // يمكنك هنا استدعاء showNotification() إذا كنت تفضل الإشعار أيضًا
    // showNotification();
};
