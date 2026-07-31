export const requestUrl = async () => ({ status: 200, json: {} });
export class Notice {
  constructor(public message: string) {}
}
export class Plugin {}
export class Component {
  load() {}
}
export class MarkdownRenderer {
  static render() {}
}
export class WorkspaceLeaf {}
export class App {}
