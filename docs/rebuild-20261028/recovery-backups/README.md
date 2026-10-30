# Recovery checkpoint

Original local HEAD: b2a215bc91ddcb3a58c8059b189568fafa507a24
Exact source tree (verified through GitHub tree hash): d3efd3fb316f4612299e6f4bd083319cb81a60b5
Bundle prerequisite: 945359c74f5db57282ad45ded31dafc2ea88f9a1.

Native git push lacked authentication. The authorized GitHub connector preserved the exact source tree and this verified Git bundle. The connector-created checkpoint has a different commit SHA; the original local commit remains recoverable from the bundle. No original branch was reset or overwritten.

After fetching the prerequisite commit, run `git bundle verify` and fetch the bundle HEAD into a new local recovery ref to recover the original commit without resetting another branch.
