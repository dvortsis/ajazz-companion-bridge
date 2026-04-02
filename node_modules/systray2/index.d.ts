/// <reference types="node" />
import * as child from 'child_process';
import * as readline from 'readline';
export interface MenuItem {
    title: string;
    tooltip: string;
    checked?: boolean;
    enabled?: boolean;
    hidden?: boolean;
    items?: MenuItem[];
    icon?: string;
    isTemplateIcon?: boolean;
}
export interface Menu {
    icon: string;
    title: string;
    tooltip: string;
    items: MenuItem[];
    isTemplateIcon?: boolean;
}
export interface ClickEvent {
    type: 'clicked';
    item: MenuItem;
    seq_id: number;
    __id: number;
}
export interface ReadyEvent {
    type: 'ready';
}
export declare type Event = ClickEvent | ReadyEvent;
export interface UpdateItemAction {
    type: 'update-item';
    item: MenuItem;
    seq_id?: number;
}
export interface UpdateMenuAction {
    type: 'update-menu';
    menu: Menu;
}
export interface UpdateMenuAndItemAction {
    type: 'update-menu-and-item';
    menu: Menu;
    item: MenuItem;
    seq_id?: number;
}
export interface ExitAction {
    type: 'exit';
}
export declare type Action = UpdateItemAction | UpdateMenuAction | UpdateMenuAndItemAction | ExitAction;
export interface Conf {
    menu: Menu;
    debug?: boolean;
    copyDir?: boolean | string;
}
export default class SysTray {
    static separator: MenuItem;
    protected _conf: Conf;
    private _process;
    get process(): child.ChildProcess;
    protected _rl: readline.ReadLine;
    protected _binPath: string;
    private _ready;
    private internalIdMap;
    constructor(conf: Conf);
    private init;
    ready(): Promise<void>;
    onReady(listener: () => void): this;
    onClick(listener: (action: ClickEvent) => void): Promise<this>;
    private writeLine;
    sendAction(action: Action): Promise<this>;
    /**
     * Kill the systray process
     *
     * @param exitNode Exit current node process after systray process is killed, default is true
     */
    kill(exitNode?: boolean): Promise<void>;
    onExit(listener: (code: number | null, signal: string | null) => void): void;
    onError(listener: (err: Error) => void): void;
    get killed(): boolean;
    get binPath(): string;
}
