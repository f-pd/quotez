# Load tests

CI measures how much QOTD traffic the server takes and publishes the numbers
on the About page (`/about`). Everything runs in `.github/workflows/perf.yml`,
after each CI run on `main` that published and deployed an image (or by hand
with "Run workflow"). The load test uses the image CI just published.

- `qotd-tcp.js`: k6 script. One iteration is one RFC 865 exchange over TCP
  (connect, empty request line, read the quote, close) at a constant rate.
  Needs k6 built with the [xk6-tcp](https://github.com/NAlexandrov/xk6-tcp)
  extension:

  ```sh
  go install go.k6.io/xk6/cmd/xk6@v1.5.1
  xk6 build v1.0.0 --with github.com/NAlexandrov/xk6-tcp@v1.1.0 --output k6
  ```

- `stress.sh`: runs the real image under several CPU/RAM limits
  (`docker run --cpus --memory`) and raises the rate step by step until the
  server suffers (under 99% answered, p95 over 50 ms, or under 95% of the
  requested rate served). Runs only on the CI runner, never against
  production.

  ```sh
  docker build -t quotez:perf .
  IMAGE=quotez:perf K6=./k6 ./perf/stress.sh   # -> perf-results/ci-load.json
  ```

- Production gets only a light check after each deploy: 10 exchanges per
  second on port 17 for 30 s, stopped early if more than 5% fail.

The results (plus the image size) are merged into `stats.json` on the
`perf-stats` branch. The website server reads it from there
(`STATS_URL`, cached 10 minutes) and serves it as `/stats.json`.
