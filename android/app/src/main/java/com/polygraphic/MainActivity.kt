package com.polygraphic

import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        /*=create*/
        // setContentView(R.layout.activity_main)
    }

    private fun canBack() : Boolean {
        /*=onBack*/
        return true;
    }

    override fun onBackPressed() {
        if(canBack()) {
            super.onBackPressed()
        }
    }
}