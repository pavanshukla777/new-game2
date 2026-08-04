# Flutter wrapper
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }
-dontwarn io.flutter.embedding.**

# Hive — uses reflection to open boxes and read type adapters
-keep class com.hive.** { *; }
-keep class hive.** { *; }
-keepclassmembers class * extends com.hive.** { *; }
-dontwarn com.hive.**

# socket.io-client — uses reflection for event emitter internals
-keep class io.socket.** { *; }
-dontwarn io.socket.**

# OkHttp (used by socket.io-client)
-keep class okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# Kotlin coroutines
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembernames class kotlinx.** {
    volatile <fields>;
}

# Keep application model classes referenced by name/reflection
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# General: keep annotations
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keepattributes Signature
-keepattributes Exceptions
