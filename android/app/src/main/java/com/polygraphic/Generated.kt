package com.polygraphic

/*=bundle*/

/*=global*/

fun addEvents() {
    /*=event*/
    extensions["setTimeout"] = object : Extension {
        override fun call(vararg args: Any?): Any? {
            val receiver = args[0]
            val callback = when (args.size >= 2) {
                true -> args[1]
                false -> null
            }
            val ms = when (args.size >= 3) {
                true -> args[2]
                false -> null
            }
            if(callback is ArgumentCallback && ms is Double) {
                setTimeout({
                    callback.call(null);
                }, ms.toLong())
            }
            return null
        }
    }

    extensions["listen"] = object : Extension {
        override fun call(vararg args: Any?): Any? {
            val receiver = args[0]
            val config = when (args.size >= 2) {
                true -> args[1]
                false -> null
            }
            if (receiver is PollySpeechRecognition && config is Map<*, *>) {
                val callback = config["onResult"]
                if (callback is ArgumentCallback) {
                    speechRecognitionCallback = callback
                    if (ContextCompat.checkSelfPermission(
                            MainActivity.activity,
                            Manifest.permission.RECORD_AUDIO
                        ) != PackageManager.PERMISSION_GRANTED
                    ) {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            ActivityCompat.requestPermissions(
                                MainActivity.activity,
                                listOf(
                                    Manifest.permission.RECORD_AUDIO
                                ).toTypedArray(),
                                SPEECH_REQUEST_CODE
                            )
                        }
                    } else {
                        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                        intent.putExtra(
                            RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                            RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
                        )
                        if(config.containsKey("lang")) {
                            val lang = config["lang"]
                            if(lang is String) {
                                intent.putExtra(
                                    RecognizerIntent.EXTRA_LANGUAGE,
                                    lang
                                )
                            }
                        }
                        MainActivity.activity.startActivityForResult(intent, SPEECH_RESULT_CODE)
                    }
                }
            }
            return null
        }
    }
}