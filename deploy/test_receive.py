import importlib.util
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

if __name__ == '__main__':
    unittest.main()
