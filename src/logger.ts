import { Settings } from './settings';

/**
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
namespace Log {
  interface CallerInfo {
    name: string;
    filename: string;
    line: string;
    column: string;
  }

  function formatLogMessage(
    level: string,
    callerInfo: CallerInfo,
    message: string
  ): string {
    return `${level} ${callerInfo.filename}:${callerInfo.line}:${callerInfo.column} ${callerInfo.name}() ${message}`;
  }

  export function info(message: string) {
    const callerInfo = getFileName();
    if (callerInfo) {
      console.log(formatLogMessage('INFO', callerInfo, message));
    } else {
      console.log(`INFO ${message}`);
    }
  }

  export function debug(settings: Settings, message: string) {
    if (settings.getBoolean('LOG_DEBUG')) {
      const callerInfo = getFileName();
      if (callerInfo) {
        console.log(formatLogMessage('DEBUG', callerInfo, message));
      } else {
        console.log(`DEBUG ${message}`);
      }
    }
  }

  export function error(message: string) {
    const callerInfo = getFileName();
    if (callerInfo) {
      console.error(formatLogMessage('ERROR', callerInfo, message));
    } else {
      console.error(`ERROR ${message}`);
    }
  }

  function getFileName(): CallerInfo | null {
    const STACK_FUNC_NAME = new RegExp(
      /at\s+((\S+)\s)?\(?(\S+):(\d+):(\d+)\)?/
    );
    const err = new Error();
    Error.captureStackTrace(err);

    const stacks = err.stack?.split('\n').slice(3, 4) || [];
    if (stacks.length === 0) return null;

    const callerInfo = STACK_FUNC_NAME.exec(stacks[0]);
    if (!callerInfo) return null;

    return {
      name: callerInfo[2] || '(anonymous)',
      filename: callerInfo[3],
      line: callerInfo[4],
      column: callerInfo[5],
    };
  }
}

export { Log };
