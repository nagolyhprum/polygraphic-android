import fs from 'fs/promises'
import path from 'path'
import { Adapter, code, Component, ComponentFromConfig, GlobalState, kotlin, kotlinBundle, ProgrammingLanguage } from 'polygraphic'
import { AndroidConfig } from './types'

const speech = {
	listen : () => {
		// DO NOTHING
	},
	speak : () => {
		// DO NOTHING
	}
};

const moment = {
    startOf : () => 0,
    format : () => ""
}

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
    await handleEvents(app({
        global : state,
        local : state,
        parent : {
            height : 0,
            name : "root",
            width : 0
        }
    }), state, state, config);
    inject({
        content : kotlinBundle(),
        files : config.files,
        name : "generated.kt",
        template : "bundle"
    })
    return config.files
}

const handleEvents = (app : Component<any, any>, global : any, local : any, config : AndroidConfig) => {
    Object.keys(app).forEach(key => {
        switch(key) {
            case "adapters":
                const adapters : Adapter<any> = app.adapters || {};
                Object.keys(adapters).forEach(key => handleEvents(adapters[key]({
                    global,
                    local,
                    parent : {
                        height : 0,
                        name : "root",
                        width : 0
                    }
                }), global, local, config))
                break;
            case "children":
                app.children?.forEach(child => handleEvents(child, global, local, config))
                break;
            case "onBack":
                // TODO
                const onBack = app.onBack || [];
                onBack.forEach((item : any) => {
                    const generated = code(item, config.dependencies, {
                        global,
                        local,
                        moment,
                        speech
                    });
                    inject({
                        content : `${kotlin(generated, "\t")}`,
                        files : config.files,
                        name : "mainactivity.kt",
                        template : "onBack"
                    })
                })
                break;
            case "onChange":
            case "onClick":
            case "onInit":
            case "onEnter":
                const fun = app[key]?.map((item : any) => {
                    const generated = code(item, config.dependencies, {
                        global,
                        local,
                        moment,
                        speech
                    })
                    return kotlin(generated, "\t\t");
                }).join("\n")
                inject({
                    content : `\taddEvent("${app.id}", "${key}") { local, event ->
${fun}
\t}`,
                    files : config.files,
                    name : "generated.kt",
                    template : "event"
                })
                break;
            default:
                if(key.startsWith("on")) {
                    console.log("missing support for", key)
                }
        }
    })
}