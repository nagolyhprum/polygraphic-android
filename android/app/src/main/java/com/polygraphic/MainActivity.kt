package com.polygraphic

import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.speech.tts.TextToSpeech

class MainActivity : AppCompatActivity() {
    companion object {
        lateinit var activity : MainActivity
        lateinit var tts : TextToSpeech
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        activity = this
        tts = TextToSpeech(this) {}
        super.onCreate(savedInstanceState)
        /*=create*/
        addEvents()
        setContentView(R.layout.activity_main)
        initialize(findViewById(R.id.global), "global", Local(
            state = global,
            index = 0.0
        ))
    }

    private fun isBackHandled() : Boolean {
        val onBack = extensions["onBack"]
        if(onBack != null) {
            return onBack.call(null) == true
        }
        return false
    }

    override fun onBackPressed() {
        if(!isBackHandled()) {
            super.onBackPressed()
        }
        updateAll("onBack")
    }
}