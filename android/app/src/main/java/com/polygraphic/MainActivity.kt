package com.polygraphic

import android.content.Intent
import android.content.pm.PackageManager
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.speech.RecognizerIntent
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

    override fun onActivityResult(
			requestCode: Int,
			resultCode: Int,
			data: Intent?
	) {
        if (requestCode == SPEECH_RESULT_CODE && resultCode == RESULT_OK) {
            val transcripts = data?.getStringArrayListExtra(
					RecognizerIntent.EXTRA_RESULTS
			)
            val scores = data?.getStringArrayListExtra(
					RecognizerIntent.EXTRA_CONFIDENCE_SCORES
			)
            speechRecognitionCallback?.call(mapOf(
					"results" to listOf(
							transcripts?.mapIndexed { index, item ->
								mapOf(
										"transcript" to item,
										"confidence" to (scores?.get(index)
												?: 0)
								)
							}
					)
			))
            updateAll("speech recognition")
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onRequestPermissionsResult(
			requestCode: Int,
			permissions: Array<out String>,
			grantResults: IntArray
	) {
        when (requestCode) {
			SPEECH_REQUEST_CODE -> {
				if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
					val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
					intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
					startActivityForResult(intent, SPEECH_RESULT_CODE)
				}
			}
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    }
}