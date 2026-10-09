import java.util.Properties
import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "space.eidos.android"
    compileSdk { version = release(37) { minorApiLevel = 0 } }
    defaultConfig {
        applicationId = "space.eidos.android"
        minSdk = 28
        targetSdk = 36
        versionCode = 3
        versionName = "0.1.0"
        testInstrumentationRunner = "space.eidos.android.EidosTestRunner"
        ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
    }
    val releaseKeystore = providers.environmentVariable("ANDROID_KEYSTORE_PATH").orNull
    signingConfigs {
        if (releaseKeystore != null) {
            create("release") {
                storeFile = file(releaseKeystore)
                storePassword = providers.environmentVariable("ANDROID_KEYSTORE_PASSWORD").get()
                keyAlias = providers.environmentVariable("ANDROID_KEY_ALIAS").get()
                keyPassword = providers.environmentVariable("ANDROID_KEY_PASSWORD").get()
            }
        }
    }
    buildTypes {
        debug { applicationIdSuffix = ".dev" }
        release {
            if (releaseKeystore != null) signingConfig = signingConfigs.getByName("release")
        }
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    sourceSets["main"].jniLibs.directories.add("build/native/jniLibs")
    sourceSets["main"].assets.directories.add("build/editor-assets")
    sourceSets["main"].assets.directories.add("build/plugin-assets")
    sourceSets["main"].assets.directories.add(rootProject.file("../../packages/mobile-plugin-host/locales").path)
    packaging { jniLibs.useLegacyPackaging = false }
}

val buildNative =
    tasks.register<Exec>("buildNative") {
        workingDir(rootProject.projectDir)
        commandLine("bash", "scripts/build-native.sh")
        inputs.dir(rootProject.file("../../crates/eidos-mobile-host"))
        inputs.dir(rootProject.file("../../crates/eidos-publish"))
        inputs.dir(rootProject.file("../../crates/eidos-file-core/src"))
        inputs.file(rootProject.file("../../crates/eidos-file-core/Cargo.toml"))
        inputs.dir(rootProject.file("../../crates/eidos-runtime-host/src"))
        inputs.dir(rootProject.file("../../packages/eidos-file/generated/quickjs"))
        inputs.dir(rootProject.file("../../packages/eidos-file/src"))
        inputs.file(rootProject.file("../../packages/eidos-file/package.json"))
        inputs.file(rootProject.file("../../scripts/build-quickjs.mjs"))
        inputs.file(rootProject.file("../../scripts/generated-assets.mjs"))
        inputs.file(rootProject.file("../../packages/plugin-runtime/src/compatibility-data.json"))
        inputs.file(rootProject.file("../../packages/plugin-runtime/src/file-hook-vm.js"))
        inputs.file(rootProject.file("../../Cargo.lock"))
        inputs.file(rootProject.file("../../Cargo.toml"))
        inputs.file(rootProject.file("../../crates/eidos-runtime-host/Cargo.toml"))
        inputs.file(rootProject.file("../../crates/eidos-runtime-host/build.rs"))
        inputs.file(rootProject.file("scripts/build-native.sh"))
        inputs.file(rootProject.file("../../scripts/prepare-mobile-native.mjs"))
        inputs.file(rootProject.file("patches/graft-android-runtime.patch"))
        outputs.dir(layout.buildDirectory.dir("native/jniLibs"))
    }

tasks.named("preBuild") { dependsOn(buildNative) }

val buildWebEditor = tasks.register<Exec>("buildWebEditor") {
    workingDir(rootProject.projectDir)
    commandLine("pnpm", "build:web")
    inputs.dir(rootProject.file("web"))
    inputs.file(rootProject.file("package.json"))
    inputs.dir(rootProject.file("../../packages/eidos-file-ui/src"))
    inputs.dir(rootProject.file("../../packages/eidos-file/src"))
    inputs.dir(rootProject.file("../../packages/markdown/src"))
    inputs.dir(rootProject.file("../../packages/eidos-file-serve/src"))
    inputs.dir(rootProject.file("../../packages/mobile-plugin-host/src"))
    inputs.dir(rootProject.file("../../packages/mobile-plugin-host/locales"))
    inputs.dir(rootProject.file("../../packages/plugin-runtime/src"))
    outputs.dir(layout.buildDirectory.dir("editor-assets"))
}
tasks.named("preBuild") { dependsOn(buildWebEditor) }

val pluginLocalProperties = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
val androidPluginSources = providers.environmentVariable("EIDOS_ANDROID_PLUGIN_SOURCES")
    .orElse(pluginLocalProperties.getProperty("eidos.pluginSources", ""))
val buildPlugins = tasks.register<Exec>("buildPlugins") {
    workingDir(rootProject.projectDir)
    commandLine("node", "scripts/build-plugins.mjs")
    environment("EIDOS_ANDROID_PLUGIN_SOURCES", androidPluginSources.get())
    inputs.property("pluginSources", androidPluginSources)
    androidPluginSources.get().split(File.pathSeparator).filter { it.isNotBlank() }.forEach { source ->
        inputs.files(fileTree(source) { exclude("node_modules/**", "artifacts/**", "dist/**", ".git/**") })
    }
    inputs.dir(rootProject.file("plugins"))
    inputs.file(rootProject.file("scripts/build-plugins.mjs"))
    inputs.dir(rootProject.file("../../packages/plugin-runtime/src"))
    inputs.dir(rootProject.file("../../packages/mobile-plugin-host/src"))
    inputs.dir(rootProject.file("../../packages/plugin-sdk/src"))
    inputs.file(rootProject.file("../../pnpm-lock.yaml"))
    outputs.dir(layout.buildDirectory.dir("plugin-assets"))
}
tasks.named("preBuild") { dependsOn(buildPlugins) }

// Some device-runner installation failures return success without producing a
// test report (for example while the emulator is still booting). Fail closed.
tasks
    .matching { it.name == "connectedDebugAndroidTest" }
    .configureEach {
        doLast {
            val reports =
                fileTree(layout.buildDirectory.dir("outputs/androidTest-results/connected/debug")) {
                    include("TEST-*.xml")
                }
            check(reports.files.isNotEmpty()) {
                "No Android device test report was produced. Check that the selected device has finished booting."
            }
            reports.forEach { report ->
                val result =
                    javax.xml.parsers.DocumentBuilderFactory.newInstance()
                        .newDocumentBuilder()
                        .parse(report)
                        .documentElement
                check(
                    result.getAttribute("tests").toInt() > result.getAttribute("skipped").toInt()
                ) {
                    "No Android device tests ran: ${report.name}"
                }
                check(
                    result.getAttribute("failures").toInt() == 0 &&
                        result.getAttribute("errors").toInt() == 0
                ) {
                    "Android device tests failed: ${report.name}"
                }
            }
        }
    }

dependencies {
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
    implementation(platform("androidx.compose:compose-bom:2026.09.00"))
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended:1.7.8")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.9.4")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("androidx.work:work-runtime-ktx:2.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    // Source spans keep native task toggles tied to exact Markdown characters.
    implementation("com.atlassian.commonmark:commonmark:0.17.0")
    implementation("com.atlassian.commonmark:commonmark-ext-gfm-tables:0.17.0")
    implementation("com.atlassian.commonmark:commonmark-ext-gfm-strikethrough:0.17.0")
    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.work:work-testing:2.12.0")
    androidTestImplementation(platform("androidx.compose:compose-bom:2026.09.00"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
