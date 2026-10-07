import importlib.util
import io
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('receiver', Path(__file__).with_name('receive.py'))
receiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receiver)

class CommandBoundary(unittest.TestCase):
    def test_accepts_only_exact_full_sha(self):
        self.assertEqual(receiver.requested_sha('deploy ' + 'a' * 40), 'a' * 40)
        for command in ['', 'bash', 'deploy main', 'deploy ' + 'a' * 39, 'deploy ' + 'a' * 40 + '; id', 'deploy ' + 'a' * 40 + '\n', 'deploy ' + 'A' * 40]:
            with self.subTest(command=command), self.assertRaises(ValueError):
                receiver.requested_sha(command)

    def test_token_transport_accepts_opaque_formats_without_control_characters(self):
        for token in ['synthetic.token+/=_-:value', 'x' * 8192]:
            self.assertEqual(receiver.read_token(io.StringIO(token + '\n')), token)
        for token in ['', 'x' * 8193, 'contains space', 'tab\tvalue', 'nul\x00value', 'carriage\rvalue']:
            with self.subTest(length=len(token)), self.assertRaises(ValueError):
                receiver.read_token(io.StringIO(token + '\n'))

    def test_topology_schema_and_fixture_changes_need_operator_review(self):
        for path in ['deploy/compose.sh', 'infra/gateway.mjs', 'compose.yaml',
                     'server/db.mjs', 'server/db.ts', 'src/store.ts', 'fixture/Dockerfile', 'vendor/identity.tgz']:
            with self.subTest(path=path):
                self.assertTrue(receiver.requires_operator_review([path]))
        self.assertFalse(receiver.requires_operator_review(['public/app.js', 'server/routes.mjs', 'fixture/README.md']))

class RollbackRecord(unittest.TestCase):
    def test_same_release_retry_keeps_distinct_previous_image(self):
        previous = {'sha': 'new', 'image': 'app:new', 'previous': 'app:old'}
        self.assertEqual(receiver.deployment_record('new', 'app:new', previous)['previous'], 'app:old')
        self.assertEqual(receiver.deployment_record('newer', 'app:newer', previous)['previous'], 'app:new')

if __name__ == '__main__':
    unittest.main()
