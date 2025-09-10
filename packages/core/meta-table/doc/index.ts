import { WithMarkdown } from "./markdown"
import { WithSearch } from "./search"
import { WithProperty } from "./property"
import { BaseDocTable } from "./base"

export const ComposedDocTable = WithMarkdown(WithSearch(WithProperty(BaseDocTable)))


export class DocTable extends ComposedDocTable {
}