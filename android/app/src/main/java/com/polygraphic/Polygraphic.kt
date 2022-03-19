package com.polygraphic

import android.animation.ValueAnimator
import android.app.DatePickerDialog
import android.app.Dialog
import android.content.Context
import android.content.DialogInterface
import android.database.DataSetObserver
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.*
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.DrawableCompat
import androidx.core.view.children
import androidx.fragment.app.DialogFragment
import java.util.*

val events = mutableMapOf<Int, PollyEvent>()
val observers = mutableMapOf<View, Component>()
var speechRecognitionCallback: ArgumentCallback? = null
var last_event = System.currentTimeMillis()

val TIMEOUT = 300L

data class Local(
    var index: Double,
    var state: Any?
)

interface PollyCallback {
    fun invoke(event: Any, local: Any?, index: Any)
}

data class PollyEvent(
    val onClick: PollyCallback? = null,
    val onContext: PollyCallback? = null,
    val onEnter: PollyCallback? = null,
    val onInit: PollyCallback? = null,
    val observe: PollyCallback? = null,
    val onChange: PollyCallback? = null,
    val onResize: PollyCallback? = null
)

fun setEventForId(id: Int, callback: (PollyEvent) -> PollyEvent) {
    events[id] = callback(events[id] ?: PollyEvent())
}

fun onClick(id: Int, callback: PollyCallback) {
    setEventForId(id) {
        it.copy(
            onClick = callback
        )
    }
}

fun onContext(id: Int, callback: PollyCallback) {
    setEventForId(id) {
        it.copy(
            onContext = callback
        )
    }
}

fun onEnter(id: Int, callback: PollyCallback) {
    setEventForId(id) {
        it.copy(
            onEnter = callback
        )
    }
}

fun onInit(id: Int, callback: PollyCallback) {
    setEventForId(id) {
        it.copy(
            onInit = callback
        )
    }
}

fun observe(id: Int, callback: PollyCallback) {
    setEventForId(id) {
        it.copy(
            observe = callback
        )
    }
}

fun onChange(id: Int, callback: PollyCallback) {
    setEventForId(id) {
        it.copy(
            onChange = callback
        )
    }
}

fun onResize(id: Int, callback: PollyCallback) {
    setEventForId(id) {
        it.copy(
            onResize = callback
        )
    }
}

val inputMethodService by lazy {
    MainActivity.activity.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
}

val layoutInflaterService by lazy {
    MainActivity.activity.getSystemService(Context.LAYOUT_INFLATER_SERVICE) as LayoutInflater
}

fun showKeyboard(view: View) {
    inputMethodService.showSoftInput(view, InputMethodManager.SHOW_IMPLICIT)
}

fun closeKeyboard(view: View) {
    inputMethodService.hideSoftInputFromWindow(view.windowToken, 0)
}

fun remove(view: View) {
    observers.remove(view)
    if (view is ViewGroup) {
        view.children.asSequence().toList().forEach {
            remove(it)
        }
    }
}

fun getIdentifier(input : Any?) : Any? {
    if(input is Map<*, *>) {
        return input["key"] ?: input["id"] ?: input["value"]
    }
    return null
}

fun getName(input : Any?) : Any? {
    if(input is Map<*, *>) {
        return input["name"] ?: input["title"] ?: input["text"]
    }
    return null
}

fun animate(callback : (value : Float) -> Unit) {
    val animator = ValueAnimator.ofFloat(0f, 1f)
    animator.addUpdateListener {
        callback(it.animatedFraction)
    }
    main {
        animator.start()
    }
}

class Component(
    val view: View,
    val local: Local
) {
    val elementCache = mutableMapOf<String, Any?>()

    fun setValue(spinner: Spinner) {
        val data = elementCache["data"]
        val value = elementCache["value"]
        if (value is String && data is List<*>) {
            val item = data.find {
                it is Map<*, *> && getIdentifier(it) == value
            }
            if (item != null) {
                val index = data.indexOf(item)
                spinner.setSelection(index)
            }
        }
    }

    private val handlers = mapOf<String, (value: Any?) -> Unit>(
        "disabled" to { value ->
            val isEnabled = hasValue(value).not()
            main {
                view.isEnabled = isEnabled
            }
        },
        "focus" to { value ->
            main {
                view.requestFocus()
                showKeyboard(view)
            }
        },
        "animation" to { value ->
            if(value is Map<*, *>) {
                val name = value["name"]
                val direction = value["direction"]
                if(name is String && direction is String) {
                    val animation = "${name}_${direction}"
                    Log.d("animation", "${animation}")
                    animate { percent ->
                        val width = view.measuredWidth
                        if(animation == "opacity_in") {
                            view.alpha = percent
                        }
                        if(animation == "opacity_out") {
                            view.alpha = 1 - percent
                        }
                        if(animation == "left_in") {
                            view.translationX = -width * (1 - percent)
                            view.alpha = percent
                        }
                        if(animation == "left_out") {
                            view.translationX = -width * percent
                            view.alpha = 1 - percent
                        }
                        if(animation == "right_in") {
                            view.translationX = width * (1 - percent)
                            view.alpha = percent
                        }
                        if(animation == "right_out") {
                            view.translationX = width * percent
                            view.alpha = 1 - percent
                        }
                        elementCache["opacity"] = view.alpha
                    }
                }
            }
        },
        "data" to { value ->
            if (view is Spinner) {
                if (value is List<*>) {
                    val adapter = object : SpinnerAdapter {
                        override fun getDropDownView(
                            position: Int,
                            convertView: View?,
                            parent: ViewGroup?
                        ): View {
                            val view = layoutInflaterService.inflate(
                                view.context.resources.getIdentifier(
                                    "activity_option",
                                    "layout",
                                    view.context.packageName
                                ),
                                null
                            )
                            val textview = view.findViewById<TextView>(
                                view.context.resources.getIdentifier(
                                    "textview",
                                    "id",
                                    view.context.packageName
                                )
                            )
                            val item = getItem(position)
                            if (item is Map<*, *>) {
                                val text = getName(item)
                                if (text is String) {
                                    textview.text = text
                                }
                            }
                            return view
                        }

                        override fun getView(
                            position: Int,
                            convertView: View?,
                            parent: ViewGroup?
                        ): View {
                            val id = view.context.resources.getResourceEntryName(view.id)
                            val name = "${id}_spinner"
                            val layout = view.context.resources.getIdentifier(
                                name,
                                "layout",
                                view.context.packageName
                            )
                            val view = layoutInflaterService.inflate(layout, null)
                            val textview = view.findViewById<TextView>(
                                view.context.resources.getIdentifier(
                                    "textview",
                                    "id",
                                    view.context.packageName
                                )
                            )
                            val item = getItem(position)
                            if (item is Map<*, *>) {
                                val text = getName(item)
                                if (text is String) {
                                    textview.text = text
                                }
                            }
                            return view
                        }

                        override fun registerDataSetObserver(observer: DataSetObserver?) {
                            // IDC
                        }

                        override fun unregisterDataSetObserver(observer: DataSetObserver?) {
                            // IDC
                        }

                        override fun getItem(position: Int): Any? {
                            return value[position]
                        }

                        override fun getCount(): Int {
                            return value.size
                        }

                        override fun getItemId(position: Int): Long {
                            val map = value[position]
                            if (map is Map<*, *>) {
                                val key = getIdentifier(map)
                                if (key is String) {
                                    return key.hashCode().toLong()
                                }
                            }
                            return 0
                        }

                        override fun hasStableIds(): Boolean {
                            return true
                        }

                        override fun getItemViewType(position: Int): Int {
                            return 0
                        }

                        override fun getViewTypeCount(): Int {
                            return 1
                        }

                        override fun isEmpty(): Boolean {
                            return value.isEmpty()
                        }
                    }
                    main {
                        view.adapter = adapter
                        setValue(view)
                    }
                }
            } else if (view is ViewGroup) {
                if (value is List<*>) {
                    main {
                        val last = elementCache["prevData"]
                        elementCache["prevData"] = value
                        val prev = last as? List<Map<String, Any>>
                            ?: mutableListOf<MutableMap<String, Any>>()
                        Log.d("data", "prev : $prev")
                        Log.d("data", "curr : $value")
                        // REMOVE
                        prev.mapIndexed { index, item ->
                            mapOf(
                                "item" to item,
                                "index" to index
                            )
                        }.filter { a ->
                            !value.any { b ->
                                getIdentifier(a["item"]) == getIdentifier(b)
                            }
                        }.reversed().forEach { item ->
                            val child =
                                view.children.iterator().asSequence().toList()[item["index"] as Int]
                            remove(child)
                            view.removeView(child)
                            Log.d("data", "removed : $item")
                        }
                        // ADD
                        value.forEachIndexed { index, a ->
                            if (!prev.any { b ->
                                    getIdentifier(a) == getIdentifier(b)
                                }) {
                                if (a is MutableMap<*, *>) {
                                    val id = view.context.resources.getResourceEntryName(view.id)
                                    val layout = view.context.resources.getIdentifier(
                                        "${id}_${a["adapter"] ?: "adapter"}",
                                        "layout",
                                        view.context.packageName
                                    )
                                    val child = layoutInflaterService.inflate(
                                        layout,
                                        null
                                    )
                                    if(index < view.childCount) {
                                        view.addView(child, index)
                                    } else {
                                        view.addView(child)
                                    }
                                    Log.d("layout", "activity_${id}_${a["adapter"] ?: "adapter"}")
                                    Log.d("data", "added : $a")
                                    background {
                                        initialize(
                                            child,
                                            Local(
                                                state = a,
                                                index = index.toDouble()
                                            )
                                        )
                                    }
                                }
                            }
                        }
                        // TODO MOVE AROUND
                        value.forEachIndexed { index, adapter ->
                            val child = view.getChildAt(index)
                            if (child != null) {
                                val component = observers[child]
                                if(component != null) {
                                    component.local.state = adapter
                                    component.local.index = index.toDouble()
                                }
                            }
                        }
                        updateAll("data")
                    }
                }
            }
        },
        "value" to { value ->
            if (view is EditText && value is String) {
                if (view.text.toString() != value) {
                    main {
                        view.setText(value)
                    }
                }
            }
            if (view is CheckBox && value is Boolean) {
                if (view.isChecked != value) {
                    main {
                        view.isChecked = value
                    }
                }
            }
            if (view is Spinner) {
                main {
                    setValue(view)
                }
            }
        },
        "visible" to { value ->
            val visibility = when (hasValue(value)) {
                true -> View.VISIBLE
                false -> View.GONE
            }
            main {
                view.visibility = visibility
            }
        },
        "text" to { value ->
            val wrapped = value ?: ""
            if (view is TextView && wrapped is String) {
                main {
                    view.text = wrapped
                }
            }
        },
        "color" to { value ->
            if (view is TextView && value is String) {
                val color = Color.parseColor(value)
                main {
                    view.setTextColor(color)
                }
            }
        },
        "alt" to { value ->
            if (view is ImageView && value is String) {
                main {
                    view.setContentDescription(value)
                }
            }
        },
        "src" to { value ->
            if (view is ImageView && value is String) {
                val name = "ic_" + value.split(".")[0]
                val id = view.context.resources.getIdentifier(
                    name,
                    "drawable",
                    view.context.packageName
                )
                val drawable = ContextCompat.getDrawable(MainActivity.activity, id)
                val bitmap = Bitmap.createBitmap(
                    drawable?.intrinsicWidth ?: 0,
                    drawable?.intrinsicHeight ?: 0,
                    Bitmap.Config.ARGB_8888
                )
                drawable?.setBounds(
                    0,
                    0,
                    drawable.intrinsicWidth,
                    drawable.intrinsicHeight
                )
                val canvas = Canvas(bitmap)
                drawable?.draw(canvas)
                main {
                    view.setImageBitmap(bitmap)
                }
            }
        },
        "opacity" to { value ->
            if (value is Double) {
                val alpha = value.toFloat()
                main {
                    view.alpha = alpha
                }
            }
        },
        "background" to { value ->
            if (value is String) {
                main {
                    DrawableCompat.setTint(view.background, Color.parseColor(value))
                }
            }
        },
        "absolute" to { value ->
            if (value is Map<*, *>) {
                val layoutParams = RelativeLayout.LayoutParams(
                    view.layoutParams.width,
                    view.layoutParams.height
                )
                val top = value["top"] as? Double
                if (top != null) {
                    layoutParams.addRule(RelativeLayout.ALIGN_PARENT_TOP)
                    layoutParams.topMargin =
                        (top * view.context.resources.displayMetrics.density).toInt()
                }
                val right = value["right"] as? Double
                if (right != null) {
                    layoutParams.addRule(RelativeLayout.ALIGN_PARENT_RIGHT)
                    layoutParams.rightMargin =
                        (right * view.context.resources.displayMetrics.density).toInt()
                }
                val bottom = value["bottom"] as? Double
                if (bottom != null) {
                    layoutParams.addRule(RelativeLayout.ALIGN_PARENT_BOTTOM)
                    layoutParams.bottomMargin =
                        (bottom * view.context.resources.displayMetrics.density).toInt()
                }
                val left = value["left"] as? Double
                if (left != null) {
                    layoutParams.addRule(RelativeLayout.ALIGN_PARENT_LEFT)
                    layoutParams.leftMargin =
                        (left * view.context.resources.displayMetrics.density).toInt()
                }
                main {
                    view.layoutParams = layoutParams
                }
            }
        },
        "width" to { value ->
            val last = elementCache["width"]
            if (value is Double) {
                val layoutParams = view.layoutParams
                val to = (value * view.context.resources.displayMetrics.density).toInt()
                if(last != null) {
                    val from = layoutParams.width
                    animate {
                        layoutParams.width = (from + (it * (to - from))).toInt()
                        view.layoutParams = layoutParams
                    }
                } else {
                    layoutParams.width = to
                    main {
                        view.layoutParams = layoutParams
                    }
                }
            }
        },
        "height" to { value ->
            val last = elementCache["height"]
            if (value is Double) {
                val layoutParams = view.layoutParams
                val to = (value * view.context.resources.displayMetrics.density).toInt()
                if(last != null) {
                    val from = layoutParams.height
                    animate {
                        layoutParams.height = (from + (it * (to - from))).toInt()
                        view.layoutParams = layoutParams
                    }
                } else {
                    layoutParams.height = to
                    main {
                        view.layoutParams = layoutParams
                    }
                }
            }
        },
        /*=component.property*/
    )

    fun set(key: String, value: Any?) {
        val prev = elementCache[key]
        if (!elementCache.containsKey(key) || prev != value) {
            elementCache[key] = value
            val handler = handlers[key]
            if (handler != null) {
                handler(value)
                return
            }
            throw NotImplementedError("$key for Component")
        }
    }
}

fun getAllViewsWithID(view: View): List<View> {
    val list = when (view.id) {
        0 -> listOf()
        else -> listOf(view)
    }
    return when (view) {
        is ViewGroup -> view.children.iterator().asSequence().toList().fold(list) { total, view ->
            total + getAllViewsWithID(view)
        }
        else -> list
    }
}

fun isReady(): Boolean {
    val now = System.currentTimeMillis()
    if (last_event + TIMEOUT * 2 <= now) {
        last_event = now
        return true
    }
    return false
}

fun getElementCache(view : View) : MutableMap<String, Any?>? {
    return observers[view]?.elementCache
}

fun initialize(root: View, local: Local) {
    getAllViewsWithID(root).forEach { view ->
        val id = view.id
        val event = events[id]
        if (event != null) {
            main {
                val onClick = event.onClick
                if (onClick != null) {
                    view.setOnClickListener {
                        background {
                            if (isReady()) {
                                closeKeyboard(view)
                                onClick.invoke(
                                    mapOf<String, Any>(),
                                    local.state,
                                    local.index
                                )
                                updateAll("onClick")
                            }
                        }
                    }
                }
                val onContext = event.onContext
                if (onContext != null) {
                    view.setOnLongClickListener {
                        background {
                            if (isReady()) {
                                closeKeyboard(view)
                                onContext.invoke(
                                    mapOf<String, Any>(),
                                    local.state,
                                    local.index
                                )
                                updateAll("onLongClick")
                            }
                        }
                        true
                    }
                }
                val onEnter = event.onEnter
                if (onEnter != null && view is EditText) {
                    view.setOnEditorActionListener { v, actionId, event ->
                        if (actionId == EditorInfo.IME_ACTION_GO) {
                            if (isReady()) {
                                closeKeyboard(view)
                                onEnter.invoke(
                                    mapOf<String, Any>(),
                                    local.state,
                                    local.index
                                )
                                updateAll("onEnter")
                            }
                            true
                        } else false
                    }
                }
                val onChange = event.onChange
                if (onChange != null) {
                    if (view is CheckBox) {
                        view.setOnCheckedChangeListener { _, value ->
                            val cache = getElementCache(view)
                            if (cache != null && cache["value"] != value) {
                                cache["value"] = value
                                onChange.invoke(
                                    value,
                                    local.state,
                                    local.index ?: -1.0
                                )
                                updateAll("onChange CheckBox")
                            }
                        }
                    }
                    if (view is Spinner) {
                        view.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                            override fun onItemSelected(
                                _parent: AdapterView<*>?,
                                _view: View?,
                                position: Int,
                                _id: Long
                            ) {
                                val data = getElementCache(view)?.get("data")
                                if (data is List<*>) {
                                    val map = data[position]
                                    if (map is Map<*, *>) {
                                        val key = getIdentifier(map)
                                        if (key is String) {
                                            val cache = getElementCache(view)
                                            if (cache != null && cache["value"] != key) {
                                                cache["value"] = key
                                                onChange.invoke(
                                                    key,
                                                    local.state,
                                                    local.index ?: -1.0
                                                )
                                                updateAll("onChange Spinner")
                                            }
                                        }
                                    }
                                }
                            }

                            override fun onNothingSelected(parent: AdapterView<*>?) {
                            }
                        }
                    }
                    if (view is EditText) {
                        view.addTextChangedListener(object : TextWatcher {
                            override fun beforeTextChanged(
                                s: CharSequence?,
                                start: Int,
                                count: Int,
                                after: Int
                            ) {
                            }

                            override fun onTextChanged(
                                s: CharSequence?,
                                start: Int,
                                before: Int,
                                count: Int
                            ) {
                                val value = s.toString()
                                val cache = getElementCache(view)
                                if (cache != null && cache["value"] != value) {
                                    onChange.invoke(
                                        value,
                                        local.state,
                                        local.index
                                    )
                                    updateAll("onChange EditText")
                                }
                            }

                            override fun afterTextChanged(s: Editable?) {
                            }
                        })
                    }
                }
                val onResize = event.onResize
                if (onResize != null) {
                    val density = view.context.resources.displayMetrics.density
                    view.addOnLayoutChangeListener { view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom ->
                        background {
                            val oldWidth = oldRight - oldLeft
                            val oldHeight = oldBottom - oldTop
                            val width = right - left
                            val height = bottom - top
                            if(width != oldWidth && height != oldHeight) {
                                onResize.invoke(
                                    mapOf(
                                        "width" to (width / density).toDouble(),
                                        "height" to (height / density).toDouble()
                                    ),
                                    local.state,
                                    local.index
                                )
                                updateAll("onResize")
                            }
                        }
                    }
                }
            }
            val onInit = event.onInit
            if(onInit != null) {
                onInit.invoke(mapOf<String, Any>(), local.state, local.index ?: -1.0)
                Log.d("update", "onInit")
            }
            if (event.observe != null) {
                observers[view] = Component(view, local)
            }
        }
    }
    updateAll("initialize")
}

fun updateAll(who : String) {
    Log.d("update", who)

    for (observer in observers.toMap()) {
        val view = observer.key
        events[view.id]?.observe?.invoke(
            observer.value,
            observer.value.local.state,
            observer.value.local.index
        )
    }

    val prefs = MainActivity.activity.getSharedPreferences(
        "app",
        Context.MODE_PRIVATE
    )
    val editor = prefs.edit()
    editor.putString("state", JSON.stringify((global + mutableMapOf<String, Any?>(
        "cache" to mutableMapOf<String, Any?>()
    )).toMutableMap()))
    editor.apply()
}

class PollyPicker {
    fun date(config: Map<String, Any?>) {
        val newFragment = DatePickerFragment(MainActivity.activity) {
            val callback = config["ok"]
            if (callback is ArgumentCallback) {
                callback.call(
                        mapOf(
                                "value" to it.toDouble()
                        )
                )
                updateAll("onDate")
            }
        }
        newFragment.show(MainActivity.activity.supportFragmentManager, "datePicker")
    }
}

val picker = PollyPicker()
val SPEECH_REQUEST_CODE = 6873
val SPEECH_RESULT_CODE = 6874

class PollySpeechRecognition

val speech = PollySpeechRecognition()

class DatePickerFragment(
        private val activity: Context,
        private val callback: (date: Long) -> Unit
) : DialogFragment(), DatePickerDialog.OnDateSetListener {

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        val c = Calendar.getInstance()
        val year = c.get(Calendar.YEAR)
        val month = c.get(Calendar.MONTH)
        val day = c.get(Calendar.DAY_OF_MONTH)
        val dialog = DatePickerDialog(activity, this, year, month, day)
        dialog.setButton(DialogInterface.BUTTON_NEUTRAL, "CLEAR") { _, _ ->
            callback(-1)
            dismiss()
        }
        return dialog
    }

    override fun onDateSet(view: DatePicker, year: Int, month: Int, day: Int) {
        val calendar = Calendar.getInstance()
        calendar.set(Calendar.YEAR, year)
        calendar.set(Calendar.MONTH, month)
        calendar.set(Calendar.DAY_OF_MONTH, day)
        calendar.set(Calendar.HOUR, 0)
        calendar.set(Calendar.MINUTE, 0)
        calendar.set(Calendar.SECOND, 0)
        calendar.set(Calendar.MILLISECOND, 0)
        callback(
                calendar.timeInMillis
        )
        dismiss()
    }
}
