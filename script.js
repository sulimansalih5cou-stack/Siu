// ============================================================
// 🔔 منطق الإشعارات (Notifications Logic)
// ============================================================
function loadNotifications() {
    if (!currentUserID) return;

    // 🔥 ملاحظة: نحن نستمع إلى كل الإشعارات، ثم نفلترها محلياً للمستخدم الحالي
    onValue(ref(db, 'notifications'), (snapshot) => { 
        if (snapshot.exists()) {
            const val = snapshot.val();
            // تجميع الإشعارات وتصفيتها للمستخدم الحالي فقط
            userNotifications = Object.keys(val)
                .map(key => ({ id: key, ...val[key] }))
                .filter(n => n.uid === currentUserID) // فلترة الإشعارات التي تخص المستخدم الحالي
                .sort((a, b) => b.timestamp - a.timestamp);
            
            displayNotifications();
        } else {
            userNotifications = [];
            displayNotifications();
        }
    });
}
