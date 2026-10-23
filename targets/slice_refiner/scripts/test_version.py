"""Release priority and incremental build invariants required by AGENTS.md."""
import unittest
from version import calculate,parse_commits


class VersionTests(unittest.TestCase):
    def test_break_wins(self):
        self.assertEqual(calculate('v1.4.2 (build 1048)',[{'kind':'feat'},{'kind':'break'}]),'v2.0.0 (build 1049)')
    def test_feature_wins_over_fix(self):
        self.assertEqual(calculate('v1.4.2 (build 1048)',[{'kind':'fix'},{'kind':'feat'}]),'v1.5.0 (build 1049)')
    def test_recompile_increments(self):
        self.assertEqual(calculate('v0.2.0 (build 0002)',[]),'v0.2.1 (build 0003)')
    def test_perf_uses_patch(self):
        self.assertEqual(calculate('v1.4.2 (build 1048)',[{'kind':'perf'}]),'v1.4.3 (build 1049)')
    def test_empty_commit_body(self):
        self.assertEqual(parse_commits('abc\x1ffeat: new\x1f\x1e\n')[0]['kind'],'feat')
    def test_breaking_body(self):
        self.assertEqual(parse_commits('abc\x1frefactor: io\x1fBREAKING CHANGE: schema\x1e\n')[0]['kind'],'break')


if __name__=='__main__':unittest.main()
