// @source-hash 5c1d41af8221c59747801633ba3d8d97babdc98628dbc26aa361498d2a7e6bdc
export interface DataTable {
    id: string;
    name: string;
    columns: string[];
    rows: Array<Record<string, string | number>>;
}
export interface ChartDescription {
    id: string;
    table_id: string;
    chart_type: "bar" | "line";
    svg: string;
    description: string;
}
export interface ChartIssue {
    chart_id: string;
    issue_type: string;
    description: string;
    affected_items: string[];
}
export interface ForensicsGroundTruth {
    issues: ChartIssue[];
    clean_charts: string[];
}
export interface ForensicsData {
    tables: DataTable[];
    charts: ChartDescription[];
    groundTruth: ForensicsGroundTruth;
    objective: string;
}
export declare function generateForensicsData(seed: number): ForensicsData;
