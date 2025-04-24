import path from "node:path"
import appRootPath from "app-root-path"
import sqlite3 from "sqlite3"
import {open, Database} from "sqlite"

sqlite3.verbose()

let db: Database

const TABLE_STRINGS = [
    "CREATE TABLE IF NOT EXISTS TicketHolderMailSent(ShowID INTEGER PRIMARY KEY)",
]

/**
 * Create the database tables, if they don't already exist
 */
export async function createTables() {
    db = await open({
        filename: path.join(appRootPath.toString(), "database.db"),
        driver: sqlite3.cached.Database
    })

    for await (const t of TABLE_STRINGS) {
        await db.exec(t)
    }
    console.info("Database tables up and running")
}

type DatabaseTables = "TicketHolderMailSent" | string

/**
 * Method caller is responsible for the amount and order of params, such that it matches the column layout of the table specified
 * @param table The table to insert an entry into
 * @param params The values of the entry, in the order specified in the Database Layout
 */
export async function addEntry(table: DatabaseTables, ...params: (string | number)[]) {
    const query = "INSERT INTO " + table + " VALUES(" + params + ")"
    debugLogQuery(query)
    await db.exec(query)
}

/**
 * Select some entries from a table. Returns an empty array if no entries match condition
 * @param table where to select entries from
 * @param condition the filter condition for choosing entries
 * @param columns which columns to include. If undefined, all columns will be included
 */
export async function selectEntries(table: DatabaseTables, condition: string, columns?: string[]/* TODO: Make this a type? prevent typos */) {
    const columnString = columns === undefined ? "*" : "(" + columns + ")"
    const query = "SELECT " + columnString + " FROM " + table + " WHERE " + condition
    debugLogQuery(query)
    return await db.all(query)
}

/**
 * Select an entry from a table. Returns undefined if no entries match condition
 * @param table where to select entries from
 * @param condition the filter condition for choosing the entry
 * @param columns which columns to include. If undefined, all columns will be included
 */
export async function selectEntry(table: DatabaseTables, condition: string, columns?: string[]) {
    const columnString = columns === undefined ? "*" : "(" + columns + ")"
    const query = "SELECT " + columnString + " FROM " + table + " WHERE " + condition
    debugLogQuery(query)
    return await db.get(query)
}

/**
 * Select ALL entries from a table. Returns an empty array if the table is empty
 * @param table where to select entries from
 * @param columns which columns to include. If undefined, all columns will be included
 */
export async function selectAllEntries(table: DatabaseTables, columns?: string[]) {
    const columnString = columns === undefined ? "*" : "(" + columns + ")"
    const query = "SELECT " + columnString + " FROM " + table
    debugLogQuery(query)
    return await db.all(query)
}

export async function deleteEntries(table: DatabaseTables, condition: string) {
    const query = "DELETE FROM " + table + " WHERE " + condition
    debugLogQuery(query)
    return await db.exec(query)
}

export async function updateEntry(table: DatabaseTables, condition: string, columns: string[], newValues: string[]) {
    const query = "UPDATE " + table + " SET " + createUpdateColumnString(columns, newValues) + " WHERE " + condition
    debugLogQuery(query)
    return await db.exec(query)
}

export async function executeQuery(query: string) {
    debugLogQuery(query)
    return await db.exec(query)
}

function createUpdateColumnString(columns: string[], newValues: string[]) {
    let result = ""
    for (let i = 0; i < columns.length; i++) {
        result += columns[i] + "=\"" + newValues[i] + "\""
        if (i + 1 !== columns.length) result += ","
    }

    return result
}

function debugLogQuery(query: string) {
    console.debug("Sent SQL Query: " + query)
}
