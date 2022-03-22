import fs, { readFile } from "fs/promises";
import path from "path";
import { compile, Component, ComponentFromConfig, EventConfig, execute, GlobalState, kotlin, kotlinBundle, MATCH, ProgrammingLanguage, WRAP } from "polygraphic";
import svg2vectordrawable from "svg2vectordrawable";
import { AndroidConfig } from "./types";
import { createCanvas, loadImage } from "canvas";

const images = [{
	name : "mdpi",
	size : 48
}, {
	name : "hdpi",
	size : 72
}, {
	name : "xhdpi",
	size : 96
}, {
	name : "xxhdpi",
	size : 144
}, {
	name : "xxxhdpi",
	size : 192
}];

const createImage = async ({
	buffer,
	size,
	isRound,
	background,
	percent
} : {
    buffer : Buffer
    background : string
    percent : number
    size : number
    isRound : boolean
}) => {
	const canvas = createCanvas(size, size);
	const context = canvas.getContext("2d");
	if(isRound) {
		const half = size / 2;
		context.ellipse(half, half, half, half, 0, 0, 2 * Math.PI);
		context.clip();
	}
	context.fillStyle = background;
	context.fillRect(0, 0, size, size);
	const image = await loadImage(buffer);
	const resize = size / Math.min(image.width, image.height) * percent;
	const width = image.width * resize;
	const height = image.height * resize;
	const x = size / 2 - width / 2;
	const y = size / 2 - height / 2;
	image.width = width;
	image.height = height;
	context.drawImage(image, x, y, width, height);
	return canvas.toBuffer("image/png");
};

const isDirectory = async (file : string) => {
	const stat = await fs.stat(file);
	return stat.isDirectory();
};

const getFilesInFolder = async (folder : string) : Promise<string[]> => {
	const files = await fs.readdir(folder);
	return files.reduce(async (files, file) => {
		const fullpath = path.join(folder, file);
		return [
			...await files,
			...(await isDirectory(fullpath) ? await getFilesInFolder(fullpath) : [
				fullpath
			])
		];
	}, Promise.resolve<string[]>([]));
};

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
			let fileContent = files[file];
			if(fileContent instanceof Buffer) {
				fileContent = fileContent.toString("utf-8");
			}
			files[file] = fileContent.replace(
				RegExp(`/\\*=${template}\\*/`, "g"), (replaced) => `${replaced}\n${content}`
			).replace(
				RegExp(`<!--=${template}-->`, "g"), (replaced) => `${replaced}\n${content}`
			);
		}
	});
};

const widthRegexp = /android:width="(\d+)dp"/;
const heightRegexp = /android:width="(\d+)dp"/;

const getNumber = (input : string, regexp : RegExp) => {
	const result = regexp.exec(input);
	if(result) {
		return Number(result[1]);
	}
	return 0;
};

const scale = (input : string, percent : number) => {
	const firstCloser = input.indexOf(">");
	const lastOpener = input.lastIndexOf("<");
	const width = getNumber(input, widthRegexp);
	const height = getNumber(input, heightRegexp);
	return input.slice(0, firstCloser) + `><group 
        android:scaleX="${percent}"
        android:scaleY="${percent}"
        android:translateX="${width / 2 - width / 2 * percent}"
        android:translateY="${height / 2 - height / 2 * percent}">` + input.slice(firstCloser + 1, lastOpener) + "</group>" + input.slice(lastOpener);
};

export const android = <Global extends GlobalState>(app : ComponentFromConfig<Global, Global>) => async (
	generateState : (config : (config : EventConfig<GlobalState, null, null>) => ProgrammingLanguage) => Global
) => {
	const dependencies = new Set<string>([]);
	const generated = compile(generateState as unknown as (config : any) => ProgrammingLanguage, dependencies);
	const state = execute(generated, {}) as Global;
	state.features = ["picker.date", "speech.listen"];
	const files = await getFilesInFolder(path.join(__dirname, "..", "android"));
	const baseFolder = path.join(__dirname, "..");
	const config : AndroidConfig = {
		dependencies : new Set<string>([]),
		files : await files.reduce(async (files, path) => {
			return {
				...await files,
				[path.slice(baseFolder.length + 1)] : await fs.readFile(path)
			};
		}, Promise.resolve({}))
	};
	inject({
		files : config.files,
		name : "generated.kt",
		template : "global",
		content : `var global = ${kotlin(generated as unknown as ProgrammingLanguage, "")}`,
	});
	inject({
		content : kotlinBundle(),
		files : config.files,
		name : "generated.kt",
		template : "bundle"
	});
	inject({
		content : "implementation \"com.android.volley:volley:1.2.1\"",
		files : config.files,
		name : "build.gradle",
		template : "dependencies"
	});
	inject({
		content : "implementation \"io.noties.markwon:core:4.6.2\"",
		files : config.files,
		name : "build.gradle",
		template : "dependencies"
	});
	inject({
		content : `"markdown" to { value ->
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
	});
	const component = app({
		global : state,
		local : state,
		parent : {
			id : "global",
			height : 0,
			name : "root",
			width : 0
		}
	});
	config.files["android/app/src/main/res/layout/activity_main.xml"] = await generateLayout(component, state, state, config, "");
	return config.files;
};

const getTagName = (component : Component<any, any>) : string => {
	switch(component.name) {
	case "button":
		return "FrameLayout";
	case "checkbox":
		return "CheckBox";
	case "column":
	case "row":
		return "LinearLayout";
	case "image":
		return "ImageView";
	case "input":
		return "EditText";
	case "root":
		return "FrameLayout";
	case "scrollable":
		return "ScrollView";
	case "select":
		return "Spinner";
	case "stack":
		return "RelativeLayout";
	case "text":
		return "TextView";
	case "option":
	case "date":
		return "";
	}
};

const getSize = (input : number) : string => {
	if(input === MATCH) {
		return "match_parent";
	} else if(input === WRAP) {
		return "wrap_content";
	} else {
		return `${input}dp`;
	}
};

const mapColor = (input : string | null | undefined) : string => {
	switch(input) {
	case "white": return "#ffffffff";
	case "purple": return "#ffA020F0";
	case "black": return "#ff000000";
	}
	if(input && input[0] === "#" && input.length === 9) {
		// #rrggbbaa -> #aarrggbb
		return "#" + input.slice(7) + input.slice(1, 7);

	}
	return input || "#00000000";
};

const keys = <T>(input : T) => Object.keys(input) as Array<keyof T>;

const handleProp = (
	component : Component<any, any>, 
	props : Record<string, string>,
	config : AndroidConfig
) => {
	return keys(component).reduce(async (promise, key) => {
		const props = await promise;
		switch(key) {        
		case "clickable":
			props["android:clickable"] = `${component[key]}`;
			return props;
		case "manifest": {
			const manifest = component[key];
			if(manifest) {
				inject({
					files : config.files,
					content : `
applicationId "${manifest.package.android}"
versionCode ${manifest.version.code}
versionName "${manifest.version.name}"
                        `,
					name : "build.gradle",
					template : "config"
				});
				inject({
					files : config.files,
					content : `
<item name="colorAccent">${mapColor(manifest.background_color)}</item>
<item name="android:statusBarColor" tools:targetApi="l">${mapColor(manifest.background_color)}</item>
					`,
					name : "themes.xml",
					template : "theme"
				});
				config.files["android/app/src/main/res/values/strings.xml"] = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${manifest.name}</string>
</resources>`;
				config.files["android/app/src/main/res/drawable/ic_launcher_background.xml"] = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <solid android:color="${manifest.background_color}"/>
</shape>
`;
				const foreground = await svg2vectordrawable(await fs.readFile(manifest.icons.src.slice("file://".length), "utf-8"), {
					fillBlack : true,
					floatPrecision : 2,                        
				});
				delete config.files["android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml"];
				config.files["android/app/src/main/res/drawable/ic_launcher_foreground.xml"] = scale(foreground, manifest.icons.percent * .8);
				await Promise.all(images.map(async item => {
					delete config.files[`android/app/src/main/res/mipmap-${item.name}/ic_launcher.webp`];
					delete config.files[`android/app/src/main/res/mipmap-${item.name}/ic_launcher_round.webp`];
					const buffer = await readFile(manifest.icons.src.slice("file://".length));
					config.files[`android/app/src/main/res/mipmap-${item.name}/ic_launcher.png`] = await createImage({
						buffer,
						background : manifest.background_color,
						isRound : false,
						percent : manifest.icons.percent,
						size : item.size
					});
					config.files[`android/app/src/main/res/mipmap-${item.name}/ic_launcher_round.png`] = await createImage({
						buffer,
						background : manifest.background_color,
						isRound : true,
						percent : manifest.icons.percent,
						size : item.size
					});
				}));
			}
			return props;
		}
		case "opacity":
			props["android:alpha"] = `${component[key]}`;
			return props;
		case "id":
			props["android:id"] = `@+id/${component[key]}`;
			return props;
		case "grow":
			props["android:layout_weight"] = "1";
			return props;
		case "onClick":
			props["android:clipToPadding"] = "true";
			props["android:clipToOutline"] = "true";
			props["android:clipChildren"] = "true";
			props["android:clickable"] = "true";
			props["android:focusable"] = "true";
			if(component.width === component.height && component.width / 2 === component.round) { 
				props["android:foreground"] = "?selectableItemBackgroundBorderless";
			} else {
				props["android:foreground"] = "?selectableItemBackground";
			}
			return props;
		case "shadow":
			props["android:elevation"] = "4dp";
			return props;
		case "round":
		case "background": {
			const background = {
				round : component.round || 0,
				color : mapColor(component.background)
			};
			const name = `background_${
				background.color.replace(/\W/g, "")
			}_${
				background.round
			}round`.toLowerCase();
			config.files[`android/app/src/main/res/drawable/${name}.xml`] = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <corners android:radius="${background.round}dp" />
    <solid android:color="${background.color}"/>
</shape>`;
			props["android:background"] = `@drawable/${name}`;
			return props;
		}
		case "size":
			props["android:textSize"] = `${component.size || 16}sp`;
			return props;
		case "name": {
			const name = component[key];
			if(name === "scrollable") {
				props["android:clipToPadding"] = "true";
				props["android:clipToOutline"] = "true";
				props["android:clipChildren"] = "true";
			}
			if(name === "select") {
				props["app:backgroundTint"] = mapColor(component.color);
				config.files[`android/app/src/main/res/layout/${component.id}_spinner.xml`] = `<?xml version="1.0" encoding="utf-8"?>
<TextView
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/textview"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:textColor="${mapColor(component.color)}"
    android:textSize="${component.size}sp"
/>`;
			}
			if(name === "root") {
				props["xmlns:android"] = "http://schemas.android.com/apk/res/android";
				props["xmlns:app"] = "http://schemas.android.com/apk/res-auto";
				const child = (component.children ?? [])[0];
				props["android:layout_width"] = getSize(child.width);
				props["android:layout_height"] = getSize(child.height);
			} else {
				props["android:layout_width"] = getSize(component.width);
				props["android:layout_height"] = getSize(component.height);
			}
			if(name === "input") {
				props["android:background"] = "@null";
			}
			if(name === "row") {
				props["android:orientation"] = "horizontal";
			} else if(name === "column") {
				props["android:orientation"] = "vertical";
			}
			return props;
		}
		case "padding": {
			const padding = component[key];
			if(padding) {
				keys(padding).forEach(key => {
					props[`android:padding${key[0].toUpperCase()}${key.slice(1)}`] = `${padding[key]}dp`;
				});
			}
			return props;
		}                
		case "margin": {        
			const margin = component[key];
			if(margin) {
				keys(margin).forEach(key => {
					props[`android:layout_margin${key[0].toUpperCase()}${key.slice(1)}`] = `${margin[key]}dp`;
				});
			}
			return props;
		}
		case "color":
			props["android:textColor"] = mapColor(component[key]);
			return props;
		case "placeholder":
			props["android:hint"] = component[key] || "";
			props["android:textColorHint"] = "#ff808080";
			return props;
		case "src": {
			const fullpath = component[key] || "";
			const ext = path.extname(fullpath);
			const fullname = path.basename(fullpath);
			const name = fullname.slice(0, fullname.indexOf("."));
			if(ext === ".svg") {
				const svg = await readFile(fullpath.slice("file://".length), "utf-8");
				props["android:src"] = `@drawable/${name}`;
				config.files[`android/app/src/main/res/drawable/${name}.xml`] = await svg2vectordrawable(svg, {
					fillBlack : true,
					floatPrecision : 2,
				});
			}
			return props;
		}
		case "position": {
			const position = component[key] || {};
			keys(position).forEach(key => {
				props[`android:layout_alignParent${key[0].toUpperCase()}${key.slice(1)}`] = "true";
				props[`android:layout_margin${key[0].toUpperCase()}${key.slice(1)}`] = `${position[key]}dp`;
			});
			return props;
		}
		case "alt":
			props["android:contentDescription"] = component[key] || "";
			return props;
		case "clip":                
			props["android:clipToPadding"] = "true";
			props["android:clipToOutline"] = "true";
			props["android:clipChildren"] = "true";
			return props;
		case "text":
			props["android:text"] = component[key] || "";
			return props;
		case "mainAxisAlignment":
		case "crossAxisAlignment": {
			const {
				mainAxisAlignment = "start", 
				crossAxisAlignment = "start"
			} = component;
			const gravity = [];
			if(component.name === "row") {
				// start, center_horizontal, end, top, center_vertical, bottom
				if(mainAxisAlignment === "start") {
					gravity.push("start");
				} else if(mainAxisAlignment === "center") {
					gravity.push("center_horizontal");
				} else if(mainAxisAlignment === "end") {
					gravity.push("end");
				}
				if(crossAxisAlignment === "start") {
					gravity.push("top");
				} else if(crossAxisAlignment === "center") {
					gravity.push("center_vertical");
				} else if(crossAxisAlignment === "end") {
					gravity.push("bottom");
				}
			} else if(component.name === "column") {
				if(crossAxisAlignment === "start") {
					gravity.push("start");
				} else if(crossAxisAlignment === "center") {
					gravity.push("center_horizontal");
				} else if(crossAxisAlignment === "end") {
					gravity.push("end");
				}
				if(mainAxisAlignment === "start") {
					gravity.push("top");
				} else if(mainAxisAlignment === "center") {
					gravity.push("center_vertical");
				} else if(mainAxisAlignment === "end") {
					gravity.push("bottom");
				}
			}
			props["android:gravity"] = gravity.join("|");
			return props;
		}
		case "onEnter":
			props["android:imeOptions"]="actionGo";
			props["android:maxLines"]="1";
			props["android:inputType"]="text";
			return props;
		case "onBack":
		case "onInit":
		case "funcs":
		case "width":
		case "height":
		case "children":
		case "adapters":
		case "observe":
		case "onChange":
		case "border":
		case "onDragStart":
		case "onDragEnd":
		case "onDrop":
		case "onInput":
		case "onSelect":
		case "focus":
		case "enabled":
		case "visible":
		case "data":
		case "value":
		case "animation":
		case "markdown":
			// ALREADY HANDLED
			return props;
		}    
	}, Promise.resolve(props));
};

const generateLayout = async (
	component : Component<any, any>, 
	global : any, 
	local : any, 
	config : AndroidConfig, 
	tabs : string
) : Promise<string> => {
	const name = getTagName(component);
	if(!name) {
		return "";
	}
	const props = await handleProp(component, {
		"android:clipToPadding" : "false",
		"android:clipToOutline" : "false",
		"android:clipChildren" : "false",
	}, config);
	handleEvents(component, global, local, config);
	const children = (component.children ?? []);
	const adapters = component.adapters;
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
			});
			config.files[`android/app/src/main/res/layout/${component.id}_${key}.xml`] = await generateLayout(root, global, local, config, "");
		}));
	}    
	if(!name) return "";
	const content = (await Promise.all(children.map(child => {
		return generateLayout(child, global, local, config, tabs + "\t");
	}))).join("\n");
	if(component.name === "root" && !content) {
		return "";
	}
	return `${component.name === "root" ? "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n" : ""}${tabs}<${name}\n\t${tabs}${
		Object.keys(props).map(key => `${key}="${props[key]}"`).join(`\n\t${tabs}`)
	}\n${tabs}${content ? `>\n${content}\n${tabs}</${name}>` : "/>"}`;
};

const handleEvents = (component : Component<any, any>, global : any, local : any, config : AndroidConfig) => {
	Object.keys(component).forEach(key => {
		switch(key) {
		case "onBack": {
			const onBack = component.onBack || [];
			onBack.forEach((item : any) => {
				const generated = compile(item, config.dependencies);
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
				});
			});
			break;
		}
		case "funcs": {
			const fun = component[key]?.map((item : any) => {
				const generated = compile(() => item, config.dependencies);
				return kotlin(generated, "\t\t\t");
			}).join("\n");
			if(fun) {
				inject({
					content : fun,
					files : config.files,
					name : "generated.kt",
					template : "event"
				});
			}
			break;
		}
		case "observe":
		case "onChange":
		case "onClick":
		case "onInit":
		case "onEnter": {
			const fun = component[key]?.map((item : any) => {
				const generated = compile(item, config.dependencies);
				return kotlin(generated, "\t\t\t");
			}).join("\n");
			inject({
				content : `\t${key}(R.id.${component.id}, object : PollyCallback {
\t\toverride fun invoke(event: Any, local: Any?, index: Any) {        
${fun}
\t\t}
\t})`,
				files : config.files,
				name : "generated.kt",
				template : "event"
			});
			break;
		}
		default:
			if(key.startsWith("on")) {
				console.log("missing support for", key);
			}
		}
	});
};