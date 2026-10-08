import type { EntityMap, EntityName } from "./entities";
import { metadata } from "./schema-metadata";

/** Query specifications evaluated by repositories on tenant-scoped DTOs, never SQL. */
export type RowContext = Partial<{ [K in EntityName]: EntityMap[K] | null }>;
export interface Expression<T> {
  evaluate(row: RowContext, group?: RowContext[]): T;
  equality?: { table: EntityName; field: string; value: unknown };
}
export interface Column<T> extends Expression<T> { table: EntityName; field: string }
export type Table<K extends EntityName> = { [P in keyof EntityMap[K]]: Column<EntityMap[K][P]> } & Expression<EntityMap[K]>;
export type Selection = Record<string, Expression<unknown>>;
export type Selected<S extends Selection> = { [K in keyof S]: S[K] extends Expression<infer T> ? T : never };
export type Ordering = Expression<unknown> | { expression: Expression<unknown>; direction: 1 | -1 };

export function fields<K extends EntityName>(table: K): Table<K> {
  const result: Record<string, unknown> = { evaluate: (row: RowContext) => row[table] };
  for (const { name } of metadata[table]) result[name] = { table, field: name, evaluate: (row: RowContext) => (row[table] as unknown as Record<string, unknown> | null)?.[name] ?? null };
  return result as Table<K>;
}
export function value<T>(input: T | Expression<T>, row: RowContext): T {
  return input && typeof input === "object" && "evaluate" in input ? (input as Expression<T>).evaluate(row) : input as T;
}
function binary(a: unknown, b: unknown, compare: (a: never, b: never) => boolean): Expression<boolean> {
  return { evaluate: (row) => compare(value(a, row) as never, value(b, row) as never) };
}
export function eq(a: unknown, b: unknown): Expression<boolean> {
  const expr = binary(a, b, (x,y) => x === y);
  if (a && typeof a === "object" && "table" in a && "field" in a && !(b && typeof b === "object" && "evaluate" in b)) expr.equality = { table: (a as Column<unknown>).table, field:(a as Column<unknown>).field, value:b };
  return expr;
}
export const ne = (a: unknown,b: unknown) => binary(a,b,(x,y)=>x!==y);
export const gte = (a: unknown,b: unknown) => binary(a,b,(x,y)=>x>=y);
export const lte = (a: unknown,b: unknown) => binary(a,b,(x,y)=>x<=y);
export const and = (...expressions: (Expression<boolean> | undefined)[]): Expression<boolean> => ({ evaluate: row => expressions.every(e=>!e||e.evaluate(row)) });
export const or = (...expressions: Expression<boolean>[]): Expression<boolean> => ({ evaluate: row => expressions.some(e=>e.evaluate(row)) });
export const inArray = (a: Expression<unknown>, values: unknown[]): Expression<boolean> => ({ evaluate: row=>values.includes(a.evaluate(row)) });
export const isNull = (a: Expression<unknown>): Expression<boolean> => ({ evaluate: row=>a.evaluate(row)==null });
export const ilike = (a: Expression<unknown>, pattern: string): Expression<boolean> => {
  const regex = new RegExp('^'+pattern.split('').map(c=>c==='%'?'.*':c==='_'?'.':c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('')+'$','i');
  return { evaluate: row=>regex.test(String(a.evaluate(row)??'')) };
};
export const asc = (expression: Expression<unknown>): Ordering => ({ expression,direction:1 });
export const desc = (expression: Expression<unknown>): Ordering => ({ expression,direction:-1 });
export const add = (expression: Expression<number>, amount: number): Expression<number> => ({ evaluate: row=>expression.evaluate(row)+amount });
export const coalesce = <T>(a: Expression<T | null>, b: Expression<T>): Expression<T> => ({ evaluate: row=>a.evaluate(row)??b.evaluate(row) });
export const maximum = (expression: Expression<number>, fallback: number): Expression<number> => ({ evaluate: (row,group)=>Math.max(fallback,...(group??[row]).map(r=>expression.evaluate(r))) });
export function compareRows(a: RowContext,b: RowContext,orders: Ordering[]) {
  for(const order of orders) {
    const expression='expression' in order?order.expression:order;
    const direction='expression' in order?order.direction:1;
    const x=expression.evaluate(a),y=expression.evaluate(b);
    if(x===y)continue;
    if(x==null)return direction;
    if(y==null)return -direction;
    return (x<y?-1:1)*direction;
  }
  return 0;
}
