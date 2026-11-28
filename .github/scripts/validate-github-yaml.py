#!/usr/bin/env python3
"""Validate GitHub workflow YAML files and Issue Form templates."""

from __future__ import annotations

import argparse
import glob
import os
import sys
import yaml


class UniqueKeyLoader(yaml.SafeLoader):
    pass


def construct_mapping_no_duplicates(loader, node, deep=False):
    mapping = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            raise yaml.constructor.ConstructorError(
                'while constructing a mapping',
                node.start_mark,
                f'found duplicate key {key!r}',
                key_node.start_mark,
            )
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


UniqueKeyLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
    construct_mapping_no_duplicates,
)


def validate_issue_form(data: object) -> None:
    if not isinstance(data, dict):
        raise ValueError('Issue template must be a YAML mapping')
    for field in ('name', 'description'):
        val = data.get(field)
        if not isinstance(val, str) or not val.strip():
            raise ValueError(f'Missing or empty string field: {field}')
    body = data.get('body')
    if not isinstance(body, list) or len(body) == 0:
        raise ValueError('Issue template body must be a non-empty list')
    for idx, item in enumerate(body):
        if (
            not isinstance(item, dict)
            or not isinstance(item.get('type'), str)
            or not item['type'].strip()
        ):
            raise ValueError(f'Issue template body[{idx}] missing valid type')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--rendered-report',
        default=os.environ.get('RENDERED_REPORT_PATH', ''),
        help='Optional path to a rendered report_issue.yml file to validate.',
    )
    args = parser.parse_args()

    rendered_report = args.rendered_report.strip()
    issue_templates = sorted(
        set(
            glob.glob('.github/ISSUE_TEMPLATE/*.yml')
            + glob.glob('.github/ISSUE_TEMPLATE/*.yaml')
        )
    )
    paths = sorted(
        set(
            glob.glob('.github/workflows/*.yml')
            + glob.glob('.github/workflows/*.yaml')
            + issue_templates
            + ([rendered_report] if rendered_report else [])
        )
    )

    failed = False
    for file_path in paths:
        try:
            with open(file_path, encoding='utf-8') as fh:
                content = fh.read()
            data = yaml.load(content, Loader=UniqueKeyLoader)
            is_issue_form = (rendered_report and file_path == rendered_report) or (
                file_path.startswith('.github/ISSUE_TEMPLATE/')
                and os.path.basename(file_path) not in ('config.yml', 'config.yaml')
            )
            if is_issue_form:
                validate_issue_form(data)
        except Exception as exc:
            print(f'Invalid YAML in {file_path}: {exc}', file=sys.stderr)
            failed = True

    if failed:
        return 1

    suffix = ' (including rendered blank_report_issue.yml)' if rendered_report else ''
    print(f'Validated {len(paths)} YAML files{suffix}.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
