import fs, { readFile } from 'fs/promises'
import path from 'path'
import { Adapter, code, Component, ComponentFromConfig, GlobalState, kotlin, kotlinBundle, MATCH, ProgrammingLanguage, WRAP } from 'polygraphic'
import svg2vectordrawable from 'svg2vectordrawable';
import { AndroidConfig } from './types'

const speech = {
	listen : () => {
		// DO NOTHING
	},
	speak : () => {
		// DO NOTHING
	}
};

const moment = () => ({
    format : () => "",
    isSame : () => false
})

const isDirectory = async (file : string) => {
    const stat = await fs.stat(file);
    return stat.isDirectory()
}

const getFilesInFolder = async (folder : string) : Promise<string[]> => {
    const files = await fs.readdir(folder)
    return files.reduce(async (files, file) => {
        const fullpath = path.join(folder, file);
        return [
            ...await files,
            ...(await isDirectory(fullpath) ? await getFilesInFolder(fullpath) : [
                fullpath
            ])
        ]
    }, Promise.resolve<string[]>([]))
}

const inject = ({
    files,
    name,
    template,
    content
} : {
    files : Record<string, Buffer | string>, 
    name : string, 
    template : string, 
    content : string
}) => {
    Object.keys(files).forEach((file) => {
        if(file.toLowerCase().includes(name.toLowerCase())) {
            let fileContent = files[file]
            if(fileContent instanceof Buffer) {
                fileContent = fileContent.toString("utf-8")
            }
            files[file] = fileContent.replace(
                RegExp(`/\\*=${template}\\*/`, "g"), (replaced) => `${replaced}\n${content}`
            ).replace(
                RegExp(`<!--=${template}-->`, "g"), (replaced) => `${replaced}\n${content}`
            )
        }
    })
}

export const android = <Global extends GlobalState>(app : ComponentFromConfig<Global, Global>) => async (state : Global) => {
    state.features = ["picker.date", "speech.listen"]
    const files = await getFilesInFolder("android")
    const config : AndroidConfig = {
        dependencies : new Set<string>([]),
        files : await files.reduce(async (files, path) => {
            return {
                ...await files,
                [path] : await fs.readFile(path)
            }
        }, Promise.resolve({}))
    }
    inject({
        files : config.files,
        name : "generated.kt",
        template : "global",
        content : `var global = ${kotlin(state as unknown as ProgrammingLanguage, "")}`,
    })
    inject({
        content : kotlinBundle(),
        files : config.files,
        name : "generated.kt",
        template : "bundle"
    })
    inject({
        content : 'implementation "com.android.volley:volley:1.2.1"',
        files : config.files,
        name : "build.gradle",
        template : "dependencies"
    })
    inject({
        content : 'implementation "io.noties.markwon:core:4.6.2"',
        files : config.files,
        name : "build.gradle",
        template : "dependencies"
    })
    inject({
        content : `"markdown" to { value, last ->
    if (view is TextView && value is String) {
        main {
            val markwon = io.noties.markwon.Markwon.create(view.context)
            markwon.setMarkdown(view, value)
            view.isFocusable = false
            view.isClickable = false
            view.isLongClickable = false
            view.isEnabled = false
        }
    }
}`,
        files : config.files,
        name : "polygraphic.kt",
        template : "component.property"
    })
    const component = app({
        global : state,
        local : state,
        parent : {
            id : "global",
            height : 0,
            name : "root",
            width : 0
        }
    })
    config.files["android/app/src/main/res/layout/activity_main.xml"] = await generateLayout(component, state, state, config, "")
    return config.files
}

const getTagName = (component : Component<any, any>) : string => {
    switch(component.name) {
        case "button":
            return "FrameLayout"
        case "checkbox":
            return "CheckBox"
        case "column":
        case "row":
            return "LinearLayout"
        case "image":
            return "ImageView"
        case "input":
            return "EditText"
        case "root":
            return "FrameLayout"
        case "scrollable":
            return "ScrollView"
        case "select":
            return "Spinner"
        case "stack":
            return "RelativeLayout"
        case "text":
            return "TextView"
        case "option":
        case "date":
            return ""
    }
}

const getSize = (input : number) : string => {
    if(input === MATCH) {
        return "match_parent"
    } else if(input === WRAP) {
        return "wrap_content"
    } else {
        return `${input}dp`
    }
}

const mapColor = (input : string | null | undefined) : string => {
    switch(input) {
        case "white": return "#ffffffff"
        case "purple": return "#ffA020F0"
        case "black": return "#ff000000"
    }
    if(input && input[0] === "#" && input.length === 9) {
        // #rrggbbaa -> #aarrggbb
        return "#" + input.slice(7) + input.slice(1, 7)

    }
    return input || "#00000000";
}

const keys = <T>(input : T) => Object.keys(input) as Array<keyof T>

const unhandled = (key : never) => {
    console.log("unhandled key", key)
}

const handleProp = (
    component : Component<any, any>, 
    props : Record<string, string>,
    config : AndroidConfig
) => {
    return keys(component).reduce(async (promise, key) => {
        const props = await promise
        switch(key) {            
            case "opacity":
                props["android:alpha"] = `${component[key]}`
                return props;
            case "id":
                props["android:id"] = `@+id/${component[key]}`;
                return props;
            case "grow":
                props["android:layout_weight"] = "1"
                return props;
            case "onClick":
                props["android:clipToPadding"] = "true";
                props["android:clipToOutline"] = "true";
                props["android:clipChildren"] = "true";
                props["android:clickable"] = "true"
                props["android:focusable"] = "true"
                if(component.width === component.height && component.width / 2 === component.round) { 
                    props["android:foreground"] = "?selectableItemBackgroundBorderless"
                } else {
                    props["android:foreground"] = "?selectableItemBackground"
                }
                return props;
            case "shadow":
                props["android:elevation"] = "1dp"
                return props;
            case "round":
            case "background": {
                const background = {
                    round : component.round || 0,
                    color : mapColor(component.background)
                }
                const name = `background_${
                    background.color.replace(/\W/g, "")
                }_${
                    background.round
                }round`.toLowerCase()
                config.files[`android/app/src/main/res/drawable/${name}.xml`] = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <corners android:radius="${background.round}dp" />
    <solid android:color="${background.color}"/>
</shape>`
                props["android:background"] = `@drawable/${name}`;
                return props;
            }
            case "size":
                props["android:textSize"] = `${component.size || 16}sp`;
                return props
            case "name": {
                const name = component[key]
                if(name === "root") {
                    props["android:clickable"] = "true"
                }
                if(name === "scrollable") {
                    props["android:clipToPadding"] = "true";
                    props["android:clipToOutline"] = "true";
                    props["android:clipChildren"] = "true";
                }
                if(name === "select") {
                    props["app:backgroundTint"] = mapColor(component.color)
                    config.files[`android/app/src/main/res/layout/${component.id}_spinner.xml`] = `<?xml version="1.0" encoding="utf-8"?>
<TextView
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/textview"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:textColor="${mapColor(component.color)}"
    android:textSize="${component.size}sp"
/>`
                }
                if(name === "root") {
                    props["xmlns:android"] = "http://schemas.android.com/apk/res/android"
                    props["xmlns:app"] = "http://schemas.android.com/apk/res-auto"
                    const child = (component.children ?? [])[0]
                    props["android:layout_width"] = getSize(child.width);
                    props["android:layout_height"] = getSize(child.height);
                } else {
                    props["android:layout_width"] = getSize(component.width);
                    props["android:layout_height"] = getSize(component.height);
                }
                if(name === "input") {
                    props["android:background"] = "@null"
                }
                if(name === "row") {
                    props["android:orientation"] = "horizontal";
                } else if(name === "column") {
                    props["android:orientation"] = "vertical";
                }
                return props;
            }
            case "padding":                
                const padding = component[key];
                if(padding) {
                    keys(padding).forEach(key => {
                        props[`android:padding${key[0].toUpperCase()}${key.slice(1)}`] = `${padding[key]}dp`
                    })
                }
                return props
            case "margin":                
                const margin = component[key];
                if(margin) {
                    keys(margin).forEach(key => {
                        props[`android:layout_margin${key[0].toUpperCase()}${key.slice(1)}`] = `${margin[key]}dp`
                    })
                }
                return props
            case "color":
                props["android:textColor"] = mapColor(component[key])
                return props;
            case "placeholder":
                props["android:hint"] = component[key] || ""
                props["android:textColorHint"] = "#ff808080"
                return props
            case "src": {
                const fullpath = component[key] || "";
                const ext = path.extname(fullpath);
                const fullname = path.basename(fullpath);
                const name = fullname.slice(0, fullname.indexOf("."))
                if(ext === ".svg") {
                    const svg = await readFile(fullpath.slice("file://".length), "utf-8")
                    props["android:src"] = `@drawable/${name}`;
                    config.files[`android/app/src/main/res/drawable/${name}.xml`] = await svg2vectordrawable(svg, {
                        fillBlack : true,
                        floatPrecision : 2,
                    })
                }
                return props
            }
            case "position":
                const position = component[key] || {}
                keys(position).forEach(key => {
                    props[`android:layout_alignParent${key[0].toUpperCase()}${key.slice(1)}`] = "true"
                    props[`android:layout_margin${key[0].toUpperCase()}${key.slice(1)}`] = `${position[key]}dp`
                })
                return props
            case "alt":
                props["android:contentDescription"] = component[key] || ""
                return props;
            case "clip":                
                props["android:clipToPadding"] = "true";
                props["android:clipToOutline"] = "true";
                props["android:clipChildren"] = "true";
                return props;
            case "text":
                props["android:text"] = component[key] || "";
                return props;
            case "width":
            case "height":
            case "children":
            case "adapters":
            case "observe":
            case "onChange":
                // ALREADY HANDLED
                return props
        }    
        unhandled(key)
        return props;    
    }, Promise.resolve(props))
}

const generateLayout = async (
    component : Component<any, any>, 
    global : any, 
    local : any, 
    config : AndroidConfig, 
    tabs : string
) : Promise<string> => {
    const name = getTagName(component)
    if(!name) {
        return "";
    }
    const props = await handleProp(component, {
        "android:clipToPadding" : "false",
        "android:clipToOutline" : "false",
        "android:clipChildren" : "false",
    }, config)
    handleEvents(component, global, local, config)
    const children = (component.children ?? [])
    const adapters = component.adapters
    if(adapters) {
        await Promise.all(Object.keys(adapters).map(async key => {
            const root = adapters[key]({
                global,
                local,
                parent : {
                    width : 0,
                    height : 0,
                    name : "root"
                }
            })
            config.files[`android/app/src/main/res/layout/${component.id}_${key}.xml`] = await generateLayout(root, global, local, config, "")
        }))
    }    
    if(!name) return ""
    const content = (await Promise.all(children.map(child => {
        return generateLayout(child, global, local, config, tabs + "\t")
    }))).join("\n")
    return `${component.name === "root" ? `<?xml version="1.0" encoding="utf-8"?>\n` : ""}${tabs}<${name}\n\t${tabs}${
        Object.keys(props).map(key => `${key}="${props[key]}"`).join(`\n\t${tabs}`)
    }\n${tabs}${content ? `>\n${content}\n${tabs}</${name}>` : "/>"}`;
}

const handleEvents = (component : Component<any, any>, global : any, local : any, config : AndroidConfig) => {
    Object.keys(component).forEach(key => {
        switch(key) {
            case "onBack":
                const onBack = component.onBack || [];
                onBack.forEach((item : any) => {
                    const generated = code(item, config.dependencies, {
                        global,
                        local,
                        moment,
                        speech
                    });
                    inject({
                        content : `
                        
    extensions["onBack"] = object : Extension {
        override fun call(vararg args: Any?): Any? {                       
${kotlin(generated, "\t\t\t")}
            return false
        }
    }
                        `,
                        files : config.files,
                        name : "generated.kt",
                        template : "event"
                    })
                })
                break;
            case "funcs": {
                const fun = component[key]?.map((item : any) => {
                    const generated = code(() => item, config.dependencies, {
                        global,
                        local,
                        moment,
                        speech
                    })
                    return kotlin(generated, "\t\t\t");
                }).join("\n")
                if(fun) {
                    inject({
                        content : fun,
                        files : config.files,
                        name : "generated.kt",
                        template : "event"
                    })
                }
                break;
            }
            case "observe":
            case "onChange":
            case "onClick":
            case "onInit":
            case "onEnter": {
                const fun = component[key]?.map((item : any) => {
                    const generated = code(item, config.dependencies, {
                        global,
                        local,
                        moment,
                        speech
                    })
                    return kotlin(generated, "\t\t\t");
                }).join("\n")
                inject({
                    content : `\t${key}(R.id.${component.id}, object : PollyCallback {
\t\toverride fun invoke(event: Any, local: Any?, index: Any) {        
${fun}
\t\t}
\t})`,
                    files : config.files,
                    name : "generated.kt",
                    template : "event"
                })
                break;
            }
            default:
                if(key.startsWith("on")) {
                    console.log("missing support for", key)
                }
        }
    })
}