# استوديو ريلز السكينة

صانع ريلز إسلامية (9:16 / 4:5 / 1:1) يعمل بالكامل داخل المتصفح:
- **القرآن**: نص مصحف المدينة النبوية + الترجمات المعتمدة + التفسير الميسر/المختصر من QuranEnc، وتلاوات EveryAyah.
- **الحديث**: موسوعة الأحاديث النبوية المترجمة (HadeethEnc) بالنص والتخريج والدرجة والترجمات.
- **أقوال السلف**: مختارات من ابن القيم وابن الجوزي مع رابط الصفحة في المكتبة الشاملة / إسلام ويب.
- **التخزين**: لا شيء يُخزَّن على الخادم. الوسائط والمشاريع والقوالب والفيديوهات تُحفظ في Google Drive (صلاحية drive.file).

## التشغيل
```
npm start          # Node 20+، بلا اعتماديات
```
متغيرات اختيارية: `GOOGLE_CLIENT_ID`، `GOOGLE_API_KEY`، `GOOGLE_APP_ID` (أو أدخلها من إعدادات الموقع).

## إعداد Google Drive
1. Google Cloud Console ← أنشئ مشروعاً ← فعّل Google Drive API (وGoogle Picker API اختيارياً).
2. OAuth consent screen ← External ← أضف بريدك كمستخدم اختبار.
3. Credentials ← OAuth client ID ← Web application ← Authorized JavaScript origins = رابط الموقع.
4. ضع Client ID في متغير `GOOGLE_CLIENT_ID` على Railway أو في إعدادات الموقع.
