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
        // setContentView(R.layout.activity_main)
    }

    private fun canBack() : Boolean {
        /*=onBack*/
        return true
    }

    override fun onBackPressed() {
        if(canBack()) {
            super.onBackPressed()
        }
    }
}