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
}