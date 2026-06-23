import { buildSchema, parse, validate } from "graphql";
import { describe, expect, it } from "vitest";

import { maxDepthRule } from "./depth-limit";

const schema = buildSchema(`
  type Query {
    timetable: Timetable
  }

  type Timetable {
    id: ID!
    topics: [Topic!]!
  }

  type Topic {
    id: ID!
    comments: [Comment!]!
  }

  type Comment {
    id: ID!
    replies: [Comment!]!
  }
`);

describe("maxDepthRule", () => {
  it("allows operations at the configured maximum depth", () => {
    const document = parse(`
      query {
        timetable {
          topics {
            comments {
              id
            }
          }
        }
      }
    `);

    expect(validate(schema, document, [maxDepthRule(4)])).toHaveLength(0);
  });

  it("rejects operations deeper than the configured maximum depth", () => {
    const document = parse(`
      query {
        timetable {
          topics {
            comments {
              replies {
                id
              }
            }
          }
        }
      }
    `);

    const errors = validate(schema, document, [maxDepthRule(4)]);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("exceeds maximum depth 4");
  });
});
