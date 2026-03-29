"use strict";

function createPostgresClient() {
  return {
    async query() {
      throw new Error("Postgres adapter belum dikonfigurasi");
    },
  };
}

module.exports = { createPostgresClient };
