import { createApiApp } from "./app";
import { env } from "./env";

const app = createApiApp();

app.listen(env.port, () => {
  console.log(`[api] listening on http://localhost:${env.port}`);
  console.log(`[api] GraphQL  http://localhost:${env.port}/graphql`);
});
