# Project specific ProGuard rules for RoomMate Android Application
# Optimized for R8 Code & Resource Shrinking

# 1. Preserve Annotations and Line Numbers
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,SourceFile,LineNumberTable

# 2. Capacitor Core Bridge & Plugin Reflection
-keep class com.getcapacitor.** { *; }
-keep public class * extends com.getcapacitor.Plugin {
    public <methods>;
    public <fields>;
}
-keep public class * extends com.getcapacitor.Bridge {
    public <methods>;
    public <fields>;
}
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public <methods>;
    @com.getcapacitor.annotation.CapacitorPlugin public <methods>;
}

# 3. Android WebView JavaScript Interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# 4. Plugins: Biometric Auth, Capgo Updater, Notifications & Hardware
-keep class com.aparajita.capacitor.biometricauth.** { *; }
-keep class ee.forgr.capacitor_updater.** { *; }
-keep class com.capacitorjs.plugins.pushnotifications.** { *; }
-keep class com.capacitorjs.plugins.localnotifications.** { *; }
-keep class com.capacitorjs.plugins.keyboard.** { *; }
-keep class com.capacitorjs.plugins.statusbar.** { *; }
-keep class com.capacitorjs.plugins.haptics.** { *; }
-keep class com.capacitorjs.plugins.network.** { *; }
-keep class com.capacitorjs.plugins.app.** { *; }
-keep class com.capacitorjs.plugins.splashscreen.** { *; }

# 5. Firebase & Google Play Services
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# 6. AndroidX Core & Splashscreen
-keep class androidx.core.splashscreen.** { *; }
-keep class androidx.appcompat.** { *; }
-keep class androidx.coordinatorlayout.** { *; }

# 7. Suppress harmless warnings from build-time annotations
-dontwarn com.google.errorprone.annotations.**
-dontwarn org.checkerframework.**
-dontwarn javax.annotation.**

# 8. Firebase Crashlytics & Capawesome Plugin
-keepattributes SourceFile,LineNumberTable,*Annotation*
-keep public class * extends java.lang.Exception
-keep class io.capawesome.capacitorjs.plugins.firebase.crashlytics.** { *; }
-dontwarn io.capawesome.capacitorjs.plugins.firebase.crashlytics.**

# 9. Kotlin Coroutines & Jetpack DataStore
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-dontwarn kotlinx.coroutines.**
-keep class androidx.datastore.** { *; }
-dontwarn androidx.datastore.**

# 10. AndroidX WorkManager
-keep class androidx.work.** { *; }
-dontwarn androidx.work.**


