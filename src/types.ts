export type AndroidConfig = {
    files : Record<string, string | Buffer>
    dependencies : Set<string>
}