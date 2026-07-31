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

export class TFile {
  path: string = "";
  basename: string = "";
}

export class TFolder {
  name: string = "";
  children: any[] = [];
}

export const normalizePath = (path: string) => path;

